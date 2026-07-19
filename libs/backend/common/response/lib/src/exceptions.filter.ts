import { ArgumentsHost, Catch, HttpStatus, Logger } from '@nestjs/common';
import type { ExceptionFilter } from '@nestjs/common';
import {
  resolveProblemContentLanguage,
  toProblemDetails,
  type ProblemDetailsResponse,
} from '@app/backend-common-exception';
import { type LocaleRequestSource, resolveLocaleFromRequest } from '@app/backend-common-i18n';
import { formatProblemDescriptor } from './problem-descriptor.util';
import { normalizeRequestId, requestContext } from '@app/backend-common-request-context';
import { problemInstanceForRequestId } from '@app/common-problem-details';
import { mergeVaryHeader } from './vary-header.util';

interface ProblemHttpResponse {
  status: (code: number) => ProblemHttpResponse;
  type: (contentType: string) => ProblemHttpResponse;
  header?: (name: string, value: string) => ProblemHttpResponse;
  getHeader?: (name: string) => unknown;
  json?: (body: ProblemDetailsResponse) => unknown;
  send?: (body: ProblemDetailsResponse) => unknown;
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

    const requestId =
      requestContext.getRequestId() ??
      normalizeRequestId(request.headers?.['x-request-id']) ??
      normalizeRequestId(request.id);

    // Build problem details — static fields from exception, instance from boundary
    const problem = toProblemDetails(exception, requestId ? problemInstanceForRequestId(requestId) : undefined, locale);

    this.logProblem(problem, exception);

    const problemResponse = response.status(problem.status).type('application/problem+json');

    problemResponse.header?.('content-language', resolveProblemContentLanguage(problem, locale));
    problemResponse.header?.('vary', mergeVaryHeader(problemResponse.getHeader?.('vary')));
    if (problem.status === Number(HttpStatus.UNAUTHORIZED)) {
      problemResponse.header?.('www-authenticate', 'Bearer');
    }
    if (requestId) {
      problemResponse.header?.('x-request-id', requestId);
    }

    if (typeof problemResponse.json === 'function') {
      problemResponse.json(problem);
    } else {
      problemResponse.send?.(problem);
    }
  }

  private logProblem(problem: ProblemDetailsResponse, exception: unknown): void {
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
