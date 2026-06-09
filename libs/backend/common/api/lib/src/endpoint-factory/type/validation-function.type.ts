import type { ValidationResult } from "./validation.type";

export type ValidationFunction<T = unknown> = (
  value: unknown,
) => ValidationResult<T>;
