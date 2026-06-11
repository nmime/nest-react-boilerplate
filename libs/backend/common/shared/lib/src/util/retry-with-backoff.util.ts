import { unknownToError } from "./error.util";
import { sleep } from "./sleep.util";

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: {
    retries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    factor?: number;
    shouldRetry?: (error: Error, attempt: number) => boolean;
  } = {},
): Promise<T> {
  const retries = options.retries ?? 3;
  const factor = options.factor ?? 2;
  const maxDelayMs = options.maxDelayMs ?? 5_000;
  let delayMs = options.initialDelayMs ?? 100;
  let attempt = 0;

  while (true) {
    try {
      return await operation();
    } catch (caught) {
      const error = unknownToError(caught);
      if (
        attempt >= retries ||
        options.shouldRetry?.(error, attempt) === false
      ) {
        throw error;
      }

      await sleep(delayMs);
      delayMs = Math.min(delayMs * factor, maxDelayMs);
      attempt += 1;
    }
  }
}
