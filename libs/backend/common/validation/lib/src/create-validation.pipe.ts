import { ValidationPipe } from "@nestjs/common";
import type { ValidationError } from "class-validator";
import { ClientDataValidationException } from "./exception";

export interface ValidationExceptionIssue {
  property: string;
  constraints: Record<string, string>;
  message?: string;
  detail?: string;
  pointer?: string;
}

export interface ValidationExceptionBody {
  type: "urn:problem:nest-react-boilerplate:client-data-validation";
  title: "Client data validation failed";
  status: 400;
  detail: string;
  code: "client-data-validation";
  errors: ValidationExceptionIssue[];
}

function getValidationPropertyPath(
  error: ValidationError,
  parentPath?: string,
): string {
  return parentPath ? `${parentPath}.${error.property}` : error.property;
}

function toJsonPointer(propertyPath: string): string {
  return `/${propertyPath
    .split(".")
    .map((segment) => segment.replace(/~/gu, "~0").replace(/\//gu, "~1"))
    .join("/")}`;
}

function getFirstConstraintMessage(
  constraints: Record<string, string>,
): string | undefined {
  return Object.values(constraints)[0];
}

function createValidationIssue(
  property: string,
  constraints: Record<string, string>,
): ValidationExceptionIssue {
  const message = getFirstConstraintMessage(constraints);

  return {
    property,
    constraints,
    ...(message ? { message, detail: message } : {}),
    pointer: toJsonPointer(property),
  };
}

function flattenValidationIssues(
  errors: ValidationError[],
  parentPath?: string,
): ValidationExceptionIssue[] {
  return errors.flatMap((error) => {
    const property = getValidationPropertyPath(error, parentPath);
    const issues: ValidationExceptionIssue[] = [];

    if (error.constraints && Object.keys(error.constraints).length > 0) {
      issues.push(createValidationIssue(property, error.constraints));
    }

    const childIssues = flattenValidationIssues(error.children ?? [], property);
    if (childIssues.length > 0) {
      return [...issues, ...childIssues];
    }

    if (issues.length === 0) {
      issues.push(createValidationIssue(property, {}));
    }

    return issues;
  });
}

export function createValidationExceptionBody(
  errors: ValidationError[],
): ValidationExceptionBody {
  return {
    type: "urn:problem:nest-react-boilerplate:client-data-validation",
    title: "Client data validation failed",
    status: 400,
    detail: "Request client data validation failed.",
    code: "client-data-validation",
    errors: flattenValidationIssues(errors),
  };
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: (errors) =>
      new ClientDataValidationException(
        createValidationExceptionBody(errors).errors,
      ),
  });
}
