import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { keys } from "./keys";

/**
 * Initialize OpenTelemetry instrumentation for Node.js services.
 *
 * Sets up OTLP/HTTP exporters for traces, metrics, and logs.
 * Should be called once at application startup (e.g., Next.js instrumentation.ts
 * or NestJS bootstrap).
 *
 * Environment variables:
 * - OTEL_SERVICE_NAME: Service name for resource attributes
 * - OTEL_EXPORTER_OTLP_ENDPOINT: OTLP collector endpoint (default: http://localhost:4318)
 */
export const initializeObservability = () => {
  const isNodeServer =
    process.env.NEXT_RUNTIME === "nodejs" || typeof window === "undefined";

  if (!isNodeServer) {
    return;
  }

  const { OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_SERVICE_NAME } = keys();

  const exporter = new OTLPLogExporter({
    url: `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/logs`,
  });
  // biome-ignore lint/suspicious/noExplicitAny: Type casting needed due to SDK version mismatch
  const logRecordProcessor = exporter as unknown as any;

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]: OTEL_SERVICE_NAME,
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`,
      }),
    }),
    logRecordProcessor,
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();

  console.log("Observability initialized with OTel");
};
