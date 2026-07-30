// @requirements REQ-API-VALIDATION-004
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { OneOfValidationPipe } from './one-of.validation.pipe';

describe('OneOfValidationPipe', () => {
  it('returns the value when it is one of the allowed values', () => {
    const pipe = new OneOfValidationPipe(['asc', 'desc']);

    expect(pipe.transform('asc')).toBe('asc');
    expect(pipe.transform('desc')).toBe('desc');
  });

  it('throws a BadRequestException when the value is not allowed', () => {
    const pipe = new OneOfValidationPipe(['asc', 'desc']);

    expect(() => pipe.transform('sideways')).toThrow(BadRequestException);
    expect(() => pipe.transform('sideways')).toThrow('Value is not allowed.');
  });

  it('supports numeric allowed values', () => {
    const pipe = new OneOfValidationPipe([1, 2, 3]);

    expect(pipe.transform(2)).toBe(2);
    expect(() => pipe.transform(4)).toThrow(BadRequestException);
  });
});
