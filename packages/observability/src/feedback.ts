/**
 * Feedback logging utilities for user feedback submission observability.
 *
 * Provides structured logging for feedback workflows (screenshots, GitHub
 * issue creation, LLM formatting). Already OTel-only, no Sentry references.
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

export interface FeedbackContext {
  userId?: string;
  organizationId?: string;
  organizationName?: string;
  category?: string;
  pageUrl?: string;
  requestId?: string;
}

export interface FeedbackLogContext extends FeedbackContext {
  durationMs?: number;
  success?: boolean;
  errorMessage?: string;
  errorCode?: string;
  [key: string]: unknown;
}

export interface ScreenshotLogContext extends FeedbackLogContext {
  fileSizeBytes?: number;
  storageKey?: string;
  urlExpirySeconds?: number;
}

export interface GitHubIssueLogContext extends FeedbackLogContext {
  issueNumber?: number;
  issueUrl?: string;
  issueId?: number;
  labels?: string[];
}

export interface LLMFormattingLogContext extends FeedbackLogContext {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  usedFallback?: boolean;
}

function emitFeedbackLog(
  level: LogLevel,
  message: string,
  context: FeedbackLogContext
): void {
  if (!shouldLog(level)) {
    return;
  }

  const attributes: Record<string, string | number | boolean> = {
    "feedback.service": "feedback",
  };
  for (const [key, value] of Object.entries(context)) {
    if (
      value !== undefined &&
      value !== null &&
      (typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean")
    ) {
      attributes[`feedback.${key}`] = value;
    }
  }

  try {
    const logger = logs.getLogger("feedback");
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
  const contextStr = formatFeedbackContext(context);
  const prefix = `[FEEDBACK][${level.toUpperCase()}]`;
  if (contextStr) {
    consoleFn(`${prefix} ${message}`, contextStr);
  } else {
    consoleFn(`${prefix} ${message}`);
  }
}

function formatFeedbackContext(context: FeedbackLogContext): string {
  const parts: string[] = [];

  if (context.userId) parts.push(`user=${context.userId.slice(0, 8)}...`);
  if (context.organizationName) parts.push(`org=${context.organizationName}`);
  if (context.category) parts.push(`category=${context.category}`);
  if (context.durationMs !== undefined)
    parts.push(`duration=${context.durationMs}ms`);
  if (context.success !== undefined) parts.push(`success=${context.success}`);
  if (context.errorCode) parts.push(`error=${context.errorCode}`);

  return parts.length > 0 ? `{${parts.join(", ")}}` : "";
}

export class FeedbackLogger {
  private context: FeedbackContext;
  private startTime: number;

  constructor(context: FeedbackContext = {}) {
    this.context = context;
    this.startTime = performance.now();
  }

  child(additionalContext: Partial<FeedbackContext>): FeedbackLogger {
    const logger = new FeedbackLogger({
      ...this.context,
      ...additionalContext,
    });
    logger.startTime = this.startTime;
    return logger;
  }

  private getElapsedMs(): number {
    return Math.round(performance.now() - this.startTime);
  }

  debug(message: string, context: Partial<FeedbackLogContext> = {}): void {
    emitFeedbackLog("debug", message, { ...this.context, ...context });
  }

  info(message: string, context: Partial<FeedbackLogContext> = {}): void {
    emitFeedbackLog("info", message, { ...this.context, ...context });
  }

  warn(message: string, context: Partial<FeedbackLogContext> = {}): void {
    emitFeedbackLog("warn", message, { ...this.context, ...context });
  }

  error(message: string, context: Partial<FeedbackLogContext> = {}): void {
    emitFeedbackLog("error", message, { ...this.context, ...context });
  }

  submissionStart(details: {
    title: string;
    hasScreenshot: boolean;
  }): void {
    this.info("Feedback submission started", {
      title: details.title,
      hasScreenshot: details.hasScreenshot,
    });
  }

  submissionSuccess(details: {
    feedbackId: string;
    issueNumber?: number;
    issueUrl?: string;
  }): void {
    this.info("Feedback submitted successfully", {
      feedbackId: details.feedbackId,
      issueNumber: details.issueNumber,
      issueUrl: details.issueUrl,
      durationMs: this.getElapsedMs(),
      success: true,
    });
  }

  submissionFailed(error: Error): void {
    this.error(`Feedback submission failed: ${error.message}`, {
      durationMs: this.getElapsedMs(),
      success: false,
      errorMessage: error.message,
      errorCode: error.name,
    });
  }

  screenshotUpload(
    context: Omit<ScreenshotLogContext, keyof FeedbackContext>
  ): void {
    const message = context.success
      ? "Screenshot uploaded successfully"
      : "Screenshot upload failed";
    emitFeedbackLog(context.success ? "info" : "error", message, {
      ...this.context,
      ...context,
    });
  }

  githubIssueCreation(
    context: Omit<GitHubIssueLogContext, keyof FeedbackContext>
  ): void {
    const message = context.success
      ? `GitHub issue #${context.issueNumber} created`
      : "GitHub issue creation failed";
    emitFeedbackLog(context.success ? "info" : "error", message, {
      ...this.context,
      ...context,
    });
  }

  llmFormatting(
    context: Omit<LLMFormattingLogContext, keyof FeedbackContext>
  ): void {
    const message = context.usedFallback
      ? "Issue formatted using fallback"
      : "Issue formatted with LLM";
    emitFeedbackLog(context.success ? "info" : "warn", message, {
      ...this.context,
      ...context,
    });
  }

  databaseStorage(context: { feedbackId: string; success: boolean }): void {
    const message = context.success
      ? "Feedback stored in database"
      : "Failed to store feedback in database";
    emitFeedbackLog(context.success ? "debug" : "error", message, {
      ...this.context,
      ...context,
    });
  }
}

export function createFeedbackLogger(
  context: FeedbackContext
): FeedbackLogger {
  return new FeedbackLogger(context);
}

export async function withFeedbackTiming<T>(
  logger: FeedbackLogger,
  operationName: string,
  operation: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  logger.debug(`Starting ${operationName}`);

  try {
    const result = await operation();
    const durationMs = Math.round(performance.now() - start);
    logger.debug(`Completed ${operationName}`, { durationMs, success: true });
    return result;
  } catch (error) {
    const durationMs = Math.round(performance.now() - start);
    logger.error(`Failed ${operationName}`, {
      durationMs,
      success: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export const feedbackLog = {
  debug: (message: string, context: FeedbackLogContext = {}) =>
    emitFeedbackLog("debug", message, context),
  info: (message: string, context: FeedbackLogContext = {}) =>
    emitFeedbackLog("info", message, context),
  warn: (message: string, context: FeedbackLogContext = {}) =>
    emitFeedbackLog("warn", message, context),
  error: (message: string, context: FeedbackLogContext = {}) =>
    emitFeedbackLog("error", message, context),
};
