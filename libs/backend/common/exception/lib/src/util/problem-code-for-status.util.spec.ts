// @requirements REQ-API-PROBLEM-001
import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { problemCodeForStatus } from './problem-code-for-status.util';

describe('problemCodeForStatus', () => {
  it('maps known statuses to their canonical short codes', () => {
    expect(problemCodeForStatus(HttpStatus.BAD_REQUEST)).toBe('bad-request');
    expect(problemCodeForStatus(HttpStatus.TOO_MANY_REQUESTS)).toBe('rate-limited');
    expect(problemCodeForStatus(HttpStatus.INTERNAL_SERVER_ERROR)).toBe('internal-server-error');
  });

  it('derives a slug from the title for unmapped statuses', () => {
    expect(problemCodeForStatus(HttpStatus.I_AM_A_TEAPOT)).toBe('i-am-a-teapot');
    expect(problemCodeForStatus(HttpStatus.UNPROCESSABLE_ENTITY)).toBe('unprocessable-entity');
    expect(problemCodeForStatus(599)).toBe('unexpected-error');
  });
});
