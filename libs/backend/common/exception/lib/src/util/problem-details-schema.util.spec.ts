import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { ProblemTypeCode } from '@app/common-problem-details';
import {
  getProblemDetailsSchema,
  getRegisteredProblemDetailsSchema,
  problemDetailsOpenApiSchema,
} from './problem-details-schema.util';

describe('getProblemDetailsSchema', () => {
  it('documents a generic about:blank 400 response without claiming validation extensions', () => {
    const schema400 = getProblemDetailsSchema(HttpStatus.BAD_REQUEST);
    expect(schema400.properties?.status?.example).toBe(400);
    expect(schema400.properties?.title?.example).toBe('Bad Request');
    expect(schema400.properties?.errors).toBeUndefined();
    expect(schema400.properties?.type?.enum).toEqual(['about:blank']);
    expect(schema400.required).toEqual(['type', 'title', 'status']);
  });

  it('omits the validation errors array for non-validation statuses', () => {
    const schema401 = getProblemDetailsSchema(HttpStatus.UNAUTHORIZED);
    expect(schema401.properties?.status?.example).toBe(401);
    expect(schema401.properties?.title?.example).toBe('Unauthorized');
    expect(schema401.properties?.errors).toBeUndefined();
  });

  it('exposes the static RFC 9457 problem schema', () => {
    expect(problemDetailsOpenApiSchema.required).toBeUndefined();
    expect(problemDetailsOpenApiSchema.properties?.type?.format).toBe('uri-reference');
    expect(problemDetailsOpenApiSchema.properties?.status).toMatchObject({ minimum: 100, maximum: 599 });
    expect(problemDetailsOpenApiSchema.additionalProperties).toBe(true);
  });

  it('documents registered type, status, detail, and stable code as an exact response profile', () => {
    const schema = getRegisteredProblemDetailsSchema('step-up-required');

    expect(schema.required).toEqual(['type', 'title', 'status', 'detail', 'code']);
    expect(schema.properties?.type?.enum).toEqual(['https://example.com/problems#step-up-required']);
    expect(schema.properties?.title?.enum).toBeUndefined();
    expect(schema.properties?.title?.description).toContain('localized');
    expect(schema.properties?.status?.enum).toEqual([403]);
    expect(schema.properties?.code?.enum).toEqual(['step-up-required']);
  });

  it('documents declared extension fields and rejects unknown registered codes', () => {
    const schema = getRegisteredProblemDetailsSchema('resource-conflict');

    expect(schema.properties?.resourceType?.description).toContain('resource category');
    expect(schema.properties?.field?.description).toContain('field involved');
    expect(() => getRegisteredProblemDetailsSchema('unknown' as ProblemTypeCode)).toThrow(
      'Unknown registered problem type',
    );
  });
});
