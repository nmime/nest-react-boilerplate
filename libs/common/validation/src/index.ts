import { BadRequestException, ValidationPipe } from "@nestjs/common";
import type { ValidationError } from "class-validator";

export interface ProblemValidationIssue {
  property: string;
  constraints: Record<string, string>;
}

export interface ProblemValidationErrorBody {
  type: "https://example.com/problems/validation-error";
  title: "Validation failed";
  status: 400;
  detail: string;
  errors: ProblemValidationIssue[];
}

export function createProblemValidationBody(
  errors: ValidationError[],
): ProblemValidationErrorBody {
  return {
    type: "https://example.com/problems/validation-error",
    title: "Validation failed",
    status: 400,
    detail: "Request validation failed.",
    errors: errors.map((error) => ({
      property: error.property,
      constraints: error.constraints ?? {},
    })),
  };
}

export function createProblemValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: (errors) =>
      new BadRequestException(createProblemValidationBody(errors)),
  });
}
