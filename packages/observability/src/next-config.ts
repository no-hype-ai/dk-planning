/**
 * Next.js OTel configuration wrapper.
 *
 * Replaces the former withSentry() wrapper. Currently a passthrough
 * that documents the OTel integration pattern. The actual OTel SDK
 * bootstrap happens in instrumentation.ts via Next.js's
 * instrumentation hook (app/instrumentation.ts).
 *
 * Future: may add OTel-specific Next.js config (e.g., custom headers,
 * source map handling for OTel error correlation).
 */

import type { NextConfig } from "next";

/**
 * Wrap a Next.js config with observability settings.
 *
 * Currently a passthrough. The OTel SDK is initialized via the
 * Next.js instrumentation hook, not via config wrapping.
 */
export const withObservability = (config: NextConfig): NextConfig => {
  return {
    ...config,
    experimental: {
      ...config.experimental,
      // Ensure instrumentation hook is enabled
      instrumentationHook: true,
    },
  };
};
