/**
 * Environment variable validation for OTel configuration.
 *
 * Uses @t3-oss/env-core + zod for runtime validation.
 * Sentry env vars have been removed; only OTel variables remain.
 */

import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const keys = () =>
  createEnv({
    server: {
      OTEL_SERVICE_NAME: z.string().default("app"),
      OTEL_EXPORTER_OTLP_ENDPOINT: z
        .string()
        .url()
        .default("http://localhost:4318"),
    },
    runtimeEnv: process.env,
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  });
