import { HttpException, HttpStatus } from '@nestjs/common';
import { BaseException } from '../abstract/base.exception';
import type { ProblemDetails } from '../type/problem-details.type';
import { createProblemDetails } from './create-problem-details.util';
import { isObjectRecord } from './is-object-record.util';
import { localizeProblemDetails } from './localize-problem-details.util';
import { mapHttpStatusToProblemTitle } from './map-http-status-to-problem-title.util';
import { problemCodeForStatus } from './problem-code-for-status.util';

const isProblemDetails = (value: unknown): value is ProblemDetails =>
  isObjectRecord(value) &&
  'type' in value &&
  'title' in value &&
  'status' in value;

export const getProblemStatus = (error: unknown): number => {
  if (error instanceof BaseException) {
    return error.status;
  }

  if (error instanceof HttpException) {
    return error.getStatus();
  }

  return HttpStatus.INTERNAL_SERVER_ERROR;
};

/**
 * Convert any error to ProblemDetails (RFC 9457).
 *
 * Rules:
 * - Static fields (type, title, detail, status) from exception definition
 * - instance from HTTP boundary (requestId)
 * - info from typed data context
 * - meta, cause, stack NEVER exposed
 * - HttpException.message NEVER exposed — use static generic messages
 * - Unknown errors → generic internal error
 */
export const toProblemDetails = (
  error: unknown,
  instance?: string,
  locale?: string,
): ProblemDetails => {
  // 1. Factory exceptions (RFC 9457 compliant)
  if (error instanceof BaseException) {
    const problem = error.toProblemDetails(instance);

    if (problem.info && Object.keys(problem.info).length === 0) {
      delete problem.info;
    }

    return localizeProblemDetails(problem, locale);
  }

  // 2. HttpException — NEVER expose message
  if (error instanceof HttpException) {
    const status = error.getStatus();
    const response = error.getResponse();

    if (isProblemDetails(response)) {
      return localizeProblemDetails(response, locale);
    }

    // Generic static problem — no message leakage
    return localizeProblemDetails(
      createProblemDetails({
        code: problemCodeForStatus(status),
        detail: mapHttpStatusToProblemTitle(status),
        status,
        title: mapHttpStatusToProblemTitle(status),
      }),
      locale,
    );
  }

  // 3. Unknown error — generic internal server error
  return localizeProblemDetails(
    createProblemDetails({
      code: 'internal_server_error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      title: 'Internal Server Error',
      detail: 'An unexpected error occurred',
    }),
    locale,
  );
};
