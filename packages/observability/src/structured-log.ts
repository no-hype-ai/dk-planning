/**
 * Structured logging for pipeline observability.
 *
 * Provides context-aware logging with duration tracking and OTel integration.
 * Copied from behavior-labs-ai with no modifications needed (already OTel-only).
 */

import { logs, SeverityNumber } from "@opentelemetry/api-logs";

type LogLevel = "debug" | "info" | "warn" | "error";

const severityMap: Record<LogLevel, SeverityNumber> = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

const levelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

const shouldLog = (level: LogLevel): boolean =>
  levelPriority[level] >= levelPriority[currentLevel];

export interface PipelineContext {
  evaluationId?: string;
  conceptId?: string;
  organizationId?: string;
  projectId?: string;
  stage?: string;
  jobId?: string;
}

export interface LogContext extends PipelineContext {
  durationMs?: number;
  success?: boolean;
  errorCode?: string;
  [key: string]: unknown;
}

export interface LLMLogContext extends LogContext {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  estimatedCost?: number;
}

export interface StorageLogContext extends LogContext {
  storageKey?: string;
  fileSizeBytes?: number;
  operation?: "upload" | "download" | "delete" | "head";
  mimeType?: string;
}

export interface AssetLogContext extends LogContext {
  assetId?: string;
  assetType?: "IMAGE" | "VIDEO" | "DOCUMENT";
  fileName?: string;
  processingStep?: string;
}

function emitStructuredLog(
  level: LogLevel,
  message: string,
  context: LogContext
): void {
  if (!shouldLog(level)) {
    return;
  }

  const attributes: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(context)) {
    if (
      value !== undefined &&
      value !== null &&
      (typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean")
    ) {
      attributes[key] = value;
    }
  }

  try {
    const logger = logs.getLogger("pipeline");
    logger.emit({
      severityNumber: severityMap[level],
      severityText: level.toUpperCase(),
      body: message,
      attributes,
    });
  } catch {
    // OTel not initialized
  }

  const consoleFn = console[level] || console.log;
  const contextStr = formatContext(context);
  if (contextStr) {
    consoleFn(`[${level.toUpperCase()}] ${message}`, contextStr);
  } else {
    consoleFn(`[${level.toUpperCase()}] ${message}`);
  }
}

function formatContext(context: LogContext): string {
  const parts: string[] = [];

  if (context.evaluationId) parts.push(`eval=${context.evaluationId}`);
  if (context.conceptId) parts.push(`concept=${context.conceptId}`);
  if (context.jobId) parts.push(`job=${context.jobId}`);
  if (context.stage) parts.push(`stage=${context.stage}`);
  if (context.durationMs !== undefined)
    parts.push(`duration=${context.durationMs}ms`);
  if (context.success !== undefined) parts.push(`success=${context.success}`);
  if (context.errorCode) parts.push(`errorCode=${context.errorCode}`);

  return parts.length > 0 ? `{${parts.join(", ")}}` : "";
}

export class PipelineLogger {
  private context: PipelineContext;

  constructor(context: PipelineContext) {
    this.context = context;
  }

  child(additionalContext: Partial<PipelineContext>): PipelineLogger {
    return new PipelineLogger({ ...this.context, ...additionalContext });
  }

  debug(message: string, context: Partial<LogContext> = {}): void {
    emitStructuredLog("debug", message, { ...this.context, ...context });
  }

  info(message: string, context: Partial<LogContext> = {}): void {
    emitStructuredLog("info", message, { ...this.context, ...context });
  }

  warn(message: string, context: Partial<LogContext> = {}): void {
    emitStructuredLog("warn", message, { ...this.context, ...context });
  }

  error(message: string, context: Partial<LogContext> = {}): void {
    emitStructuredLog("error", message, { ...this.context, ...context });
  }

  stageStart(stageName: string): void {
    this.info(`Starting ${stageName} stage`, { stage: stageName });
  }

  stageComplete(stageName: string, durationMs: number): void {
    this.info(`Completed ${stageName} stage`, {
      stage: stageName,
      durationMs,
      success: true,
    });
  }

  stageFailed(stageName: string, error: Error, durationMs?: number): void {
    this.error(`Failed ${stageName} stage: ${error.message}`, {
      stage: stageName,
      durationMs,
      success: false,
      errorCode: error.name,
    });
  }

  llmCall(context: Omit<LLMLogContext, keyof PipelineContext>): void {
    const message = context.success ? "LLM call completed" : "LLM call failed";
    emitStructuredLog(context.success ? "info" : "error", message, {
      ...this.context,
      ...context,
    });
  }

  storageOperation(
    context: Omit<StorageLogContext, keyof PipelineContext>
  ): void {
    const message = context.success
      ? `Storage ${context.operation} completed`
      : `Storage ${context.operation} failed`;
    emitStructuredLog(context.success ? "info" : "error", message, {
      ...this.context,
      ...context,
    });
  }

  assetProcessing(
    context: Omit<AssetLogContext, keyof PipelineContext>
  ): void {
    const message = `Asset processing: ${context.processingStep}`;
    emitStructuredLog("info", message, { ...this.context, ...context });
  }
}

export function createPipelineLogger(context: PipelineContext): PipelineLogger {
  return new PipelineLogger(context);
}

export async function withTiming<T>(
  operation: () => Promise<T>,
  onComplete: (durationMs: number, result: T) => void,
  onError?: (durationMs: number, error: Error) => void
): Promise<T> {
  const start = performance.now();
  try {
    const result = await operation();
    const durationMs = Math.round(performance.now() - start);
    onComplete(durationMs, result);
    return result;
  } catch (error) {
    const durationMs = Math.round(performance.now() - start);
    if (onError) {
      onError(
        durationMs,
        error instanceof Error ? error : new Error(String(error))
      );
    }
    throw error;
  }
}

export const pipelineLog = {
  debug: (message: string, context: LogContext = {}) =>
    emitStructuredLog("debug", message, context),
  info: (message: string, context: LogContext = {}) =>
    emitStructuredLog("info", message, context),
  warn: (message: string, context: LogContext = {}) =>
    emitStructuredLog("warn", message, context),
  error: (message: string, context: LogContext = {}) =>
    emitStructuredLog("error", message, context),
};
