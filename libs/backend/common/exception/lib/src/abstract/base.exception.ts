import type { BaseExceptionInput } from "../type/base-exception-input.type";
import type { ProblemDetails } from "../type/problem-details.type";
import { createProblemDetails } from "../util/create-problem-details.util";

export class BaseException extends Error {
  readonly code?: string;
  readonly detail?: string;
  readonly instance?: string;
  readonly status: number;
  readonly title: string;
  readonly type?: string;
  readonly extensions?: Record<string, unknown>;

  constructor(input: BaseExceptionInput) {
    super(input.detail ?? input.title, { cause: input.cause });
    this.name = new.target.name;
    this.code = input.code;
    this.detail = input.detail;
    this.instance = input.instance;
    this.status = input.status;
    this.title = input.title;
    this.type = input.type;
    this.extensions = input.extensions;
  }

  toProblemDetails(instance?: string): ProblemDetails {
    return createProblemDetails({
      code: this.code,
      detail: this.detail,
      extensions: this.extensions,
      instance: this.instance ?? instance,
      status: this.status,
      title: this.title,
      type: this.type,
    });
  }
}
