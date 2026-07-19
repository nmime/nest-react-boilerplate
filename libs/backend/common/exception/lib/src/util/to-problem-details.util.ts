import { HttpException, HttpStatus } from '@nestjs/common';
import { BaseException } from '../abstract/base.exception';
import type { ProblemDetailsResponse } from '../type/problem-details.type';
import { createProblemDetails } from './create-problem-details.util';
import { localizeProblemDetails } from './localize-problem-details.util';
import { mapHttpStatusToProblemTitle } from './map-http-status-to-problem-title.util';

function normalizeStatus(status: unknown): number {
  return Number.isInteger(status) && Number(status) >= 100 && Number(status) <= 599
    ? Number(status)
    : HttpStatus.INTERNAL_SERVER_ERROR;
}

export const getProblemStatus = (error: unknown): number => {
  if (error instanceof BaseException) {
    return error.status;
  }

  return error instanceof HttpException ? normalizeStatus(error.getStatus()) : HttpStatus.INTERNAL_SERVER_ERROR;
};

/**
 * Convert an exception occurrence to the repository's RFC 9457 producer profile.
 * Arbitrary Nest response bodies and exception messages are deliberately ignored:
 * only factory exceptions can publish documented extension members.
 */
export const toProblemDetails = (error: unknown, instance?: string, locale?: string): ProblemDetailsResponse => {
  if (error instanceof BaseException) {
    return localizeProblemDetails(error.toProblemDetails(instance), locale);
  }

  const status = getProblemStatus(error);
  return localizeProblemDetails(
    createProblemDetails({
      type: 'about:blank',
      title: mapHttpStatusToProblemTitle(status),
      status,
      instance,
    }),
    locale,
  );
};
