import { ArgumentsHost, Catch, HttpStatus, Logger } from '@nestjs/common';
import type { ExceptionFilter } from '@nestjs/common';
import { toProblemDetails, type ProblemDetails } from '@app/backend-common-exception';
import {
  type LocaleRequestSource,
  resolveLocaleFromRequest,
} from '@app/common-i18n';
import { formatProblemDescriptor } from './problem-descriptor.util';
import { randomUUID } from 'crypto';

interface ProblemHttpResponse {
  status: (code: number) => ProblemHttpResponse;
  type: (contentType: string) => ProblemHttpResponse;
  header?: (name: string, value: string) => ProblemHttpResponse;
  json?: (body: ProblemDetails) => unknown;
  send?: (body: ProblemDetails) => unknown;
}

interface RequestWithId {
  id?: string;
  headers?: Record<string, string | string[] | undefined>;
}

@Catch()
export class ExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<LocaleRequestSource & RequestWithId>();
    const response = http.getResponse<ProblemHttpResponse>();
    const locale = resolveLocaleFromRequest(request);

    // Extract or generate request ID for instance URI
    const requestId =
      request.id ??
      (request.headers?.['x-request-id'] as string) ??
      randomUUID();

    // Build problem details — static fields from exception, instance from boundary
    const problem = toProblemDetails(
      exception,
      `/${requestId}`,
      locale,
    );

    this.logProblem(problem, exception);

    const problemResponse = response
      .status(problem.status)
      .type('application/problem+json');

    problemResponse.header?.('content-language', locale);
    problemResponse.header?.('x-request-id', requestId);

    if (typeof problemResponse.json === 'function') {
      problemResponse.json(problem);
    } else {
      problemResponse.send?.(problem);
    }
  }

  private logProblem(problem: ProblemDetails, exception: unknown): void {
    const descriptor = formatProblemDescriptor(problem);

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
