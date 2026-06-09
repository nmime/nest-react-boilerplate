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

function getValidationPropertyPath(
  error: ValidationError,
  parentPath?: string,
): string {
  return parentPath ? `${parentPath}.${error.property}` : error.property;
}

function flattenValidationIssues(
  errors: ValidationError[],
  parentPath?: string,
): ProblemValidationIssue[] {
  return errors.flatMap((error) => {
    const property = getValidationPropertyPath(error, parentPath);
    const issues: ProblemValidationIssue[] = [];

    if (error.constraints && Object.keys(error.constraints).length > 0) {
      issues.push({
        property,
        constraints: error.constraints,
      });
    }

    const childIssues = flattenValidationIssues(error.children ?? [], property);
    if (childIssues.length > 0) {
      return [...issues, ...childIssues];
    }

    if (issues.length === 0) {
      issues.push({
        property,
        constraints: {},
      });
    }

    return issues;
  });
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
    errors: flattenValidationIssues(errors),
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
