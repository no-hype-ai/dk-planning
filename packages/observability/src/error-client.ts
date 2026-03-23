/**
 * Browser-safe error parsing.
 *
 * Extracts a human-readable message from any thrown value and logs
 * to console.error. No server-side or OTel dependencies so it is
 * safe for use in client components (e.g., global-error.tsx).
 */

export const parseError = (error: unknown): string => {
  let message = "An error occurred";

  if (error instanceof Error) {
    message = error.message;
  } else if (error && typeof error === "object" && "message" in error) {
    message = error.message as string;
  } else {
    message = String(error);
  }

  console.error("Error:", message, error);

  return message;
};
