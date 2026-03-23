/**
 * Standard health check utilities.
 *
 * Provides helpers for implementing the required health endpoints:
 * - GET /health  (liveness probe — no dependency checks)
 * - GET /ready   (readiness probe — checks critical dependencies)
 *
 * @see docs/application-instrumentation.md#health-check-standard
 */

export interface HealthCheckResult {
  status: "ok" | "degraded" | "unhealthy";
  checks?: Record<string, DependencyCheck>;
  timestamp?: string;
}

export interface DependencyCheck {
  status: "ok" | "unhealthy";
  latencyMs?: number;
  message?: string;
}

/**
 * Simple liveness response. No dependency checks.
 * Use for GET /health (k8s liveness probe).
 */
export function livenessCheck(): HealthCheckResult {
  return { status: "ok" };
}

/**
 * Readiness check that runs dependency checks in parallel.
 * Use for GET /ready (k8s readiness probe).
 *
 * @param checks - Map of dependency name to check function
 * @param timeoutMs - Per-check timeout (default 5000ms)
 */
export async function readinessCheck(
  checks: Record<string, () => Promise<void>>,
  timeoutMs = 5000
): Promise<HealthCheckResult> {
  const results: Record<string, DependencyCheck> = {};
  let allOk = true;

  const entries = Object.entries(checks);

  await Promise.all(
    entries.map(async ([name, checkFn]) => {
      const start = performance.now();
      try {
        await Promise.race([
          checkFn(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), timeoutMs)
          ),
        ]);
        results[name] = {
          status: "ok",
          latencyMs: Math.round(performance.now() - start),
        };
      } catch (error) {
        allOk = false;
        results[name] = {
          status: "unhealthy",
          latencyMs: Math.round(performance.now() - start),
          message: error instanceof Error ? error.message : String(error),
        };
      }
    })
  );

  return {
    status: allOk ? "ok" : "unhealthy",
    checks: results,
    timestamp: new Date().toISOString(),
  };
}
