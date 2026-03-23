import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    instrumentation: "src/instrumentation.ts",
    tracing: "src/tracing.ts",
    log: "src/log.ts",
    "structured-log": "src/structured-log.ts",
    feedback: "src/feedback.ts",
    error: "src/error.ts",
    "error-client": "src/error-client.ts",
    health: "src/health.ts",
    "next-config": "src/next-config.ts",
    keys: "src/keys.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: [
    // Self-references
    "@datakinetic/observability/log",
    "@datakinetic/observability/keys",
    "@datakinetic/observability/error",
    "@datakinetic/observability/instrumentation",
    // External dependencies
    "next",
    "@opentelemetry/api",
    "@opentelemetry/api-logs",
    "@opentelemetry/auto-instrumentations-node",
    "@opentelemetry/exporter-logs-otlp-http",
    "@opentelemetry/exporter-metrics-otlp-http",
    "@opentelemetry/exporter-trace-otlp-http",
    "@opentelemetry/resources",
    "@opentelemetry/sdk-metrics",
    "@opentelemetry/sdk-node",
    "@opentelemetry/semantic-conventions",
    "@t3-oss/env-core",
    "zod",
  ],
});
