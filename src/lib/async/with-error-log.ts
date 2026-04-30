// Error-handling helper for after()-callback bodies and other fire-and-
// forget async work. The pre-existing pattern was each call site rolling
// its own try/catch + console.error, which made it easy to forget.
//
// Usage:
//   import { after } from "next/server";
//   import { withErrorLog } from "@/lib/async/with-error-log";
//
//   after(() => withErrorLog("regenerate ai memo", async () => {
//     await regenerateAiMemoForValidation(validationId);
//   }));
//
// Behavior:
//   - Runs the body. On success, returns the body's resolved value.
//   - On rejection, logs `[<label>] <error>` to console and (when DEBUG_AFTER
//     env is set) rethrows so local dev surfaces the failure. In prod, swallows
//     by default — `after()` callbacks crashing tear down the response.
//   - Optional fallback value lets callers keep typed return shapes.

export async function withErrorLog<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T | undefined>;
export async function withErrorLog<T>(
  label: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<T>;
export async function withErrorLog<T>(
  label: string,
  fn: () => Promise<T>,
  fallback?: T,
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[${label}]`, err);
    if (process.env.DEBUG_AFTER === "true") {
      throw err;
    }
    return fallback;
  }
}
