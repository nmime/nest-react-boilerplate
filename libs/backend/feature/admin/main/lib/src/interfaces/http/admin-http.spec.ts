import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedRequest } from '@app/backend-feature-auth-shared';
import { AdminApplicationError } from '../../application';
import { executeAdminUseCase, requestContextFromRequest, toHttpException } from './admin-http';

describe('toHttpException', () => {
  it('maps not_found to NotFoundException', () => {
    expect(() => toHttpException(new AdminApplicationError('not_found', 'missing'))).toThrow(NotFoundException);
  });

  it('maps conflict to ConflictException', () => {
    expect(() => toHttpException(new AdminApplicationError('conflict', 'dup'))).toThrow(ConflictException);
  });

  it('maps invalid_access_policy to BadRequestException', () => {
    expect(() => toHttpException(new AdminApplicationError('invalid_access_policy', 'no'))).toThrow(
      BadRequestException,
    );
  });

  it('maps sensitive_policy_violation to BadRequestException', () => {
    expect(() => toHttpException(new AdminApplicationError('sensitive_policy_violation', 'no'))).toThrow(
      BadRequestException,
    );
  });

  it('maps other application error codes to InternalServerErrorException', () => {
    expect(() => toHttpException(new AdminApplicationError('repository_error', 'boom'))).toThrow(
      InternalServerErrorException,
    );
  });

  it('rethrows non-application errors unchanged', () => {
    const raw = new Error('unexpected');

    expect(() => toHttpException(raw)).toThrow(raw);
  });
});

describe('executeAdminUseCase', () => {
  it('returns the handler result on success', async () => {
    await expect(executeAdminUseCase(() => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('translates a thrown application error into an HTTP exception', async () => {
    await expect(
      executeAdminUseCase(() => Promise.reject(new AdminApplicationError('not_found', 'missing'))),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

const requestWith = (value: string | string[] | undefined): AuthenticatedRequest => ({
  headers: value === undefined ? {} : { 'x-request-id': value },
});

describe('requestContextFromRequest', () => {
  it('reads the first value of an array header', () => {
    expect(requestContextFromRequest(requestWith(['first', 'second']))).toEqual({ requestId: 'first' });
  });

  it('trims a scalar header value', () => {
    expect(requestContextFromRequest(requestWith('  req-42  '))).toEqual({
      requestId: 'req-42',
    });
  });

  it('caps very long header values at 256 characters', () => {
    const context = requestContextFromRequest(requestWith('a'.repeat(300)));

    expect(context.requestId).toHaveLength(256);
  });

  it('omits the request id for whitespace-only header values', () => {
    expect(requestContextFromRequest(requestWith('   '))).toEqual({});
  });

  it('omits the request id when the header is absent', () => {
    expect(requestContextFromRequest(requestWith(undefined))).toEqual({});
  });

  it('omits the request id when the request has no headers', () => {
    expect(requestContextFromRequest({})).toEqual({});
  });
});
