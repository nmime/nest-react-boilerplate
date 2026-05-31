import { BadRequestException, ValidationPipe } from "@nestjs/common";
import type { ValidationError } from "class-validator";

export interface ProblemValidationIssue {
  property: string;
  constraints: Record<string, string>;
  message?: string;
}

export interface ProblemValidationErrorBody {
  type: "urn:problem:nest-react-boilerplate:validation-error";
  title: "Validation failed";
  status: 400;
  detail: string;
  code: "validation-error";
  errors: ProblemValidationIssue[];
}

export function createProblemValidationBody(
  errors: ValidationError[],
): ProblemValidationErrorBody {
  return {
    type: "urn:problem:nest-react-boilerplate:validation-error",
    title: "Validation failed",
    status: 400,
    detail: "Request validation failed.",
    code: "validation-error",
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

export const ProblemValidationPipe = createProblemValidationPipe;
