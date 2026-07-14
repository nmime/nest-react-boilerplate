import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { getProblemDetailsSchema, problemDetailsOpenApiSchema } from './problem-details-schema.util';

describe('getProblemDetailsSchema', () => {
  it('includes the validation errors array for 400 Bad Request', () => {
    const schema400 = getProblemDetailsSchema(HttpStatus.BAD_REQUEST);
    expect(schema400.properties?.status?.example).toBe(400);
    expect(schema400.properties?.title?.example).toBe('Bad Request');
    expect(schema400.properties?.errors).toBeDefined();
  });

  it('omits the validation errors array for non-validation statuses', () => {
    const schema401 = getProblemDetailsSchema(HttpStatus.UNAUTHORIZED);
    expect(schema401.properties?.status?.example).toBe(401);
    expect(schema401.properties?.title?.example).toBe('Unauthorized');
    expect(schema401.properties?.errors).toBeUndefined();
  });

  it('exposes the static RFC 9457 problem schema', () => {
    expect(problemDetailsOpenApiSchema.required).toEqual(['type', 'title', 'status', 'code']);
    expect(problemDetailsOpenApiSchema.properties?.status?.example).toBe(400);
  });
});
