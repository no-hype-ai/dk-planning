/**
 * Server-side error parsing with OTel logging.
 *
 * Extracts a human-readable message from any thrown value and logs
 * the error via the OTel-native logger. No Sentry dependency.
 *
 * For client/browser components, use ./error-client instead.
 */

import { log } from "./log";

export const parseError = (error: unknown): string => {
  let message = "An error occurred";

  if (error instanceof Error) {
    message = error.message;
  } else if (error && typeof error === "object" && "message" in error) {
    message = error.message as string;
  } else {
    message = String(error);
  }

  try {
    log.error({ error }, `Parsing error: ${message}`);
  } catch (newError) {
    console.error("Error parsing error:", newError);
  }

  return message;
};
