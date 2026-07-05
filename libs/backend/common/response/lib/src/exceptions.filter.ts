import { ArgumentsHost, Catch, HttpStatus, Logger } from "@nestjs/common";
import type { ExceptionFilter } from "@nestjs/common";
import {
  toProblemDetails,
  type ProblemDetails,
} from "@app/backend-common-exception";
import {
  type LocaleRequestSource,
  resolveLocaleFromRequest,
} from "@app/common-i18n";
import { formatProblemDescriptor } from "./problem-descriptor.util";

interface ProblemHttpResponse {
  status: (code: number) => ProblemHttpResponse;
  type: (contentType: string) => ProblemHttpResponse;
  header?: (name: string, value: string) => ProblemHttpResponse;
  json?: (body: ProblemDetails) => unknown;
  send?: (body: ProblemDetails) => unknown;
}

@Catch()
export class ExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<LocaleRequestSource>();
    const response = http.getResponse<ProblemHttpResponse>();
    const locale = resolveLocaleFromRequest(request);
    const problem = toProblemDetails(exception, undefined, locale);

    this.logProblem(problem, exception);

    const problemResponse = response
      .status(problem.status)
      .type("application/problem+json");
    problemResponse.header?.("content-language", locale);
    if (typeof problemResponse.json === "function") {
      problemResponse.json(problem);
    } else {
      problemResponse.send?.(problem);
    }
  }

  private logProblem(problem: ProblemDetails, exception: unknown): void {
    const descriptor = formatProblemDescriptor(problem);

    // A global `@Catch()` filter bypasses Nest's built-in exception logging, so
    // 500s would otherwise leave no trace. Branch on severity: server/internal
    // errors are logged with their stack, expected client errors stay at debug.
    const serverErrorThreshold: number = HttpStatus.INTERNAL_SERVER_ERROR;
    if (problem.status >= serverErrorThreshold) {
      this.logger.error(
        `Unhandled request exception: ${descriptor}`,
        exception instanceof Error ? exception.stack : undefined,
      );
      return;
    }

    this.logger.debug(`Handled request exception: ${descriptor}`);
  }
}
