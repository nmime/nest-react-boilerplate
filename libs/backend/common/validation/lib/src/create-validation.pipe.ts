import { BadRequestException, ValidationPipe } from "@nestjs/common";
import type { ValidationError } from "class-validator";

export interface ValidationExceptionIssue {
  property: string;
  constraints: Record<string, string>;
  message?: string;
}

export interface ValidationExceptionBody {
  type: "urn:problem:nest-react-boilerplate:validation-error";
  title: "Validation failed";
  status: 400;
  detail: string;
  code: "validation-error";
  errors: ValidationExceptionIssue[];
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
): ValidationExceptionIssue[] {
  return errors.flatMap((error) => {
    const property = getValidationPropertyPath(error, parentPath);
    const issues: ValidationExceptionIssue[] = [];

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

export function createValidationExceptionBody(
  errors: ValidationError[],
): ValidationExceptionBody {
  return {
    type: "urn:problem:nest-react-boilerplate:validation-error",
    title: "Validation failed",
    status: 400,
    detail: "Request validation failed.",
    code: "validation-error",
    errors: flattenValidationIssues(errors),
  };
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: (errors) =>
      new BadRequestException(createValidationExceptionBody(errors)),
  });
}
