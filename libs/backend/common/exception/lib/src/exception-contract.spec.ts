// @requirements REQ-API-PROBLEM-001
// Evidence for: REQ-API-PROBLEM-001
import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ProblemTypeDefinitions, problemTypeForCode } from '@app/common-problem-details';
import { Exception } from './abstract/base.exception';
import { toProblemDetails } from './util/to-problem-details.util';

describe('RFC 9457 producer contract', () => {
  it('keeps registered type identity, title, and status consistent', () => {
    for (const definition of ProblemTypeDefinitions) {
      expect(problemTypeForCode(definition.code)).toBe(`https://example.com/problems#${definition.code}`);
      expect(definition.title).not.toBe('');
      expect(definition.status).toBeGreaterThanOrEqual(400);
      expect(definition.status).toBeLessThanOrEqual(599);
    }
  });

  it('keeps occurrence data separate from immutable type metadata', () => {
    const NotFoundException = Exception({
      name: 'NotFoundException',
      kind: 'client',
      problemType: 'resource-not-found',
    });
    const first = new NotFoundException({ extensions: { resourceType: 'user' } }).toProblemDetails(
      'https://example.com/problem-instances/request-1',
    );
    const second = new NotFoundException({ extensions: { resourceType: 'invoice' } }).toProblemDetails(
      'https://example.com/problem-instances/request-2',
    );

    expect(first.type).toBe(second.type);
    expect(first.title).toBe(second.title);
    expect(first.status).toBe(second.status);
    expect(first.instance).not.toBe(second.instance);
    expect(first.resourceType).not.toBe(second.resourceType);
  });

  it('does not trust payload members supplied by arbitrary HttpExceptions', () => {
    const problem = toProblemDetails(
      new HttpException({ status: 500, detail: 'postgresql://secret', meta: { token: 'secret' } }, 400),
    );

    expect(problem.status).toBe(400);
    expect(problem.type).toBe('about:blank');
    expect(JSON.stringify(problem)).not.toContain('secret');
  });
});
