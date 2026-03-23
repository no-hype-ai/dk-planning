/**
 * OpenTelemetry tracing utilities
 *
 * Provides custom span creation and context propagation for:
 * - Generic async operations (withSpan)
 * - LLM API calls (createLLMSpan)
 * - Storage operations (createStorageSpan)
 * - Evaluation pipelines (PipelineTracer)
 */

import {
  trace,
  SpanStatusCode,
  type Span,
  type Tracer,
  SpanKind,
} from "@opentelemetry/api";

/**
 * Get a named tracer instance.
 */
export function getTracer(name = "app"): Tracer {
  return trace.getTracer(name, "1.0.0");
}

/**
 * Span attributes for evaluation pipeline operations.
 */
export interface EvaluationSpanAttributes {
  evaluationId?: string;
  conceptId?: string;
  organizationId?: string;
  projectId?: string;
  stage?: string;
  jobId?: string;
  [key: string]: string | number | boolean | undefined;
}

/**
 * LLM call span attributes.
 */
export interface LLMSpanAttributes extends EvaluationSpanAttributes {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
}

/**
 * Storage operation span attributes.
 */
export interface StorageSpanAttributes extends EvaluationSpanAttributes {
  operation?: "upload" | "download" | "delete" | "head";
  storageKey?: string;
  fileSizeBytes?: number;
  mimeType?: string;
}

/**
 * Filter out undefined values for OTel-compatible attributes.
 */
function toSpanAttributes(
  attrs: Record<string, string | number | boolean | undefined>
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Execute an async operation within a new span.
 * Automatically handles errors and sets span status.
 */
export async function withSpan<T>(
  name: string,
  attributes: EvaluationSpanAttributes,
  fn: (span: Span) => Promise<T>,
  options?: {
    kind?: SpanKind;
    tracer?: Tracer;
  }
): Promise<T> {
  const tracer = options?.tracer ?? getTracer();
  const filteredAttrs = toSpanAttributes(attributes);

  return tracer.startActiveSpan(
    name,
    {
      kind: options?.kind ?? SpanKind.INTERNAL,
      attributes: filteredAttrs,
    },
    async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        if (error instanceof Error) {
          span.recordException(error);
        }
        throw error;
      } finally {
        span.end();
      }
    }
  );
}

/**
 * Create a span for evaluation pipeline processing.
 */
export function createEvaluationSpan(
  name: string,
  attributes: EvaluationSpanAttributes
): Span {
  const tracer = getTracer();
  const filteredAttrs = toSpanAttributes(attributes);

  return tracer.startSpan(name, {
    kind: SpanKind.INTERNAL,
    attributes: {
      "evaluation.id": attributes.evaluationId,
      "concept.id": attributes.conceptId,
      "organization.id": attributes.organizationId,
      "project.id": attributes.projectId,
      "evaluation.stage": attributes.stage,
      "job.id": attributes.jobId,
      ...filteredAttrs,
    },
  });
}

/**
 * Create a span for LLM API calls.
 */
export function createLLMSpan(
  operationName: string,
  attributes: LLMSpanAttributes
): Span {
  const tracer = getTracer();

  return tracer.startSpan(`llm.${operationName}`, {
    kind: SpanKind.CLIENT,
    attributes: toSpanAttributes({
      "llm.model": attributes.model,
      "llm.input_tokens": attributes.inputTokens,
      "llm.output_tokens": attributes.outputTokens,
      "llm.estimated_cost": attributes.estimatedCost,
      "evaluation.id": attributes.evaluationId,
      "evaluation.stage": attributes.stage,
    }),
  });
}

/**
 * Create a span for storage operations.
 */
export function createStorageSpan(
  operation: "upload" | "download" | "delete" | "head",
  attributes: StorageSpanAttributes
): Span {
  const tracer = getTracer();

  return tracer.startSpan(`storage.${operation}`, {
    kind: SpanKind.CLIENT,
    attributes: toSpanAttributes({
      "storage.operation": operation,
      "storage.key": attributes.storageKey,
      "storage.file_size_bytes": attributes.fileSizeBytes,
      "storage.mime_type": attributes.mimeType,
      "evaluation.id": attributes.evaluationId,
    }),
  });
}

/**
 * End a span with success status.
 */
export function endSpanSuccess(span: Span): void {
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

/**
 * End a span with error status.
 */
export function endSpanError(span: Span, error: Error | string): void {
  const message = error instanceof Error ? error.message : error;
  span.setStatus({ code: SpanStatusCode.ERROR, message });
  if (error instanceof Error) {
    span.recordException(error);
  }
  span.end();
}

/**
 * Add attributes to an existing span.
 */
export function addSpanAttributes(
  span: Span,
  attributes: Record<string, string | number | boolean | undefined>
): void {
  span.setAttributes(toSpanAttributes(attributes));
}

/**
 * Pipeline tracer for managing evaluation traces.
 * Provides convenient methods for creating spans within an evaluation context.
 */
export class PipelineTracer {
  private tracer: Tracer;
  private baseAttributes: EvaluationSpanAttributes;
  private rootSpan?: Span;

  constructor(attributes: EvaluationSpanAttributes) {
    this.tracer = getTracer();
    this.baseAttributes = attributes;
  }

  startPipeline(name = "evaluation.pipeline"): Span {
    this.rootSpan = this.tracer.startSpan(name, {
      kind: SpanKind.INTERNAL,
      attributes: toSpanAttributes({
        "evaluation.id": this.baseAttributes.evaluationId,
        "concept.id": this.baseAttributes.conceptId,
        "organization.id": this.baseAttributes.organizationId,
        "project.id": this.baseAttributes.projectId,
        "job.id": this.baseAttributes.jobId,
      }),
    });
    return this.rootSpan;
  }

  endPipeline(success: boolean, error?: Error): void {
    if (this.rootSpan) {
      if (success) {
        endSpanSuccess(this.rootSpan);
      } else {
        endSpanError(this.rootSpan, error ?? "Pipeline failed");
      }
    }
  }

  createStageSpan(stageName: string): Span {
    return this.tracer.startSpan(`evaluation.stage.${stageName}`, {
      kind: SpanKind.INTERNAL,
      attributes: toSpanAttributes({
        "evaluation.id": this.baseAttributes.evaluationId,
        "evaluation.stage": stageName,
      }),
    });
  }

  createLLMSpan(operationName: string, model: string): Span {
    return this.tracer.startSpan(`llm.${operationName}`, {
      kind: SpanKind.CLIENT,
      attributes: toSpanAttributes({
        ...this.baseAttributes,
        model,
      }),
    });
  }

  async withStage<T>(stageName: string, fn: (span: Span) => Promise<T>): Promise<T> {
    return withSpan(
      `evaluation.stage.${stageName}`,
      { ...this.baseAttributes, stage: stageName },
      fn,
      { tracer: this.tracer }
    );
  }

  async withLLMCall<T>(
    operationName: string,
    model: string,
    fn: (span: Span) => Promise<T>
  ): Promise<T> {
    return withSpan(
      `llm.${operationName}`,
      { ...this.baseAttributes, model },
      fn,
      { tracer: this.tracer, kind: SpanKind.CLIENT }
    );
  }

  async withStorage<T>(
    operation: "upload" | "download" | "delete" | "head",
    storageKey: string,
    fn: (span: Span) => Promise<T>
  ): Promise<T> {
    return withSpan(
      `storage.${operation}`,
      { ...this.baseAttributes, storageKey, operation },
      fn,
      { tracer: this.tracer, kind: SpanKind.CLIENT }
    );
  }
}

/**
 * Create a pipeline tracer for an evaluation.
 */
export function createPipelineTracer(
  attributes: EvaluationSpanAttributes
): PipelineTracer {
  return new PipelineTracer(attributes);
}
