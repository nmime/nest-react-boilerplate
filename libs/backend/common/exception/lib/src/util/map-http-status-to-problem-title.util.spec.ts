import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { mapHttpStatusToProblemTitle } from './map-http-status-to-problem-title.util';

describe('mapHttpStatusToProblemTitle', () => {
  it('maps status codes to human-readable titles', () => {
    expect(mapHttpStatusToProblemTitle(HttpStatus.BAD_REQUEST)).toBe('Bad Request');
  });

  it('falls back to Unexpected Error for unknown statuses', () => {
    expect(mapHttpStatusToProblemTitle(599)).toBe('Unexpected Error');
  });
});
