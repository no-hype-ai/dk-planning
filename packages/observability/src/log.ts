/**
 * OTel-native structured logger.
 *
 * Emits logs via @opentelemetry/api-logs and mirrors to console.
 * Supports LOG_LEVEL env var (debug | info | warn | error).
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

type LogArg = Record<string, unknown> | string | undefined;

const emitLog = (level: LogLevel, arg1: LogArg, arg2?: LogArg) => {
  if (!shouldLog(level)) {
    return;
  }

  let message: string;
  let attributes: Record<string, unknown>;

  if (typeof arg1 === "string") {
    message = arg1;
    attributes = typeof arg2 === "object" ? arg2 : {};
  } else if (typeof arg1 === "object") {
    message = typeof arg2 === "string" ? arg2 : "";
    attributes = arg1;
  } else {
    message = "";
    attributes = {};
  }

  // Emit to OpenTelemetry
  try {
    const logger = logs.getLogger("app");
    logger.emit({
      severityNumber: severityMap[level],
      severityText: level.toUpperCase(),
      body: message,
      attributes: attributes as Record<string, string | number | boolean>,
    });
  } catch {
    // OTel not initialized, fall through to console
  }

  // Always emit to console
  const consoleFn = console[level] || console.log;
  if (Object.keys(attributes).length > 0) {
    consoleFn(`[${level.toUpperCase()}] ${message}`, attributes);
  } else {
    consoleFn(`[${level.toUpperCase()}] ${message}`);
  }
};

export const log = {
  debug: (arg1: LogArg, arg2?: LogArg) => emitLog("debug", arg1, arg2),
  info: (arg1: LogArg, arg2?: LogArg) => emitLog("info", arg1, arg2),
  warn: (arg1: LogArg, arg2?: LogArg) => emitLog("warn", arg1, arg2),
  error: (arg1: LogArg, arg2?: LogArg) => emitLog("error", arg1, arg2),
};
