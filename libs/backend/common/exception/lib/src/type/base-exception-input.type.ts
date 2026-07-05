import type { ProblemDetailsInput } from "./problem-details-input.type";

export interface BaseExceptionInput extends ProblemDetailsInput {
  cause?: unknown;
}
