import { HttpStatus } from '@nestjs/common';
import { mapHttpStatusToProblemTitle } from './map-http-status-to-problem-title.util';

const statusCodeMap: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'bad-request',
  [HttpStatus.UNAUTHORIZED]: 'unauthorized',
  [HttpStatus.FORBIDDEN]: 'forbidden',
  [HttpStatus.NOT_FOUND]: 'not-found',
  [HttpStatus.CONFLICT]: 'conflict',
  [HttpStatus.TOO_MANY_REQUESTS]: 'rate-limited',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'internal-server-error',
};

export const problemCodeForStatus = (status: number): string =>
  statusCodeMap[status] ??
  mapHttpStatusToProblemTitle(status)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-');
