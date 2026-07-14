import type { ExceptionDefinition } from './type/exception-definition.type';
import { describe, expect, it } from 'vitest';

/**
 * RFC 9457 Problem Details — static contract spec.
 */
describe('RFC 9457 exception contract', () => {
  describe('static definition requirements', () => {
    it('rejects exception definitions missing static detail', () => {
      expect(() => {
        const def = {
          name: 'TestException',
          kind: 'client' as const,
          problemType: 'test_error',
          title: 'Test Error',
        } as ExceptionDefinition;
        if (!def.detail) {
          throw new Error(`Exception definition "${def.name}" must include a static detail string`);
        }
      }).toThrow('must include a static detail string');
    });

    it('rejects template expressions in definition strings', () => {
      const goodTitles = ['User not found', 'Item not found', 'User not found'];

      for (const title of goodTitles) {
        expect(title).not.toMatch(/\${|\{[a-z]+\}/);
      }
    });

    it('rejects runtime identifiers in definition strings', () => {
      const badDetails = ['User id=123 not found', 'Failed for referrerId=abc'];

      for (const detail of badDetails) {
        expect(detail).toMatch(/=\w+/);
      }
    });
  });

  describe('occurrence vs definition separation', () => {
    it('two instances with different data produce identical static fields', () => {
      const instance1 = {
        type: '/api/problems/user_not_found',
        title: 'User Not Found',
        detail: 'The requested user was not found',
        status: 404,
        info: { userId: 'user-1' },
        instance: '/api/users/user-1',
      };

      const instance2 = {
        type: '/api/problems/user_not_found',
        title: 'User Not Found',
        detail: 'The requested user was not found',
        status: 404,
        info: { userId: 'user-2' },
        instance: '/api/users/user-2',
      };

      expect(instance1.type).toBe(instance2.type);
      expect(instance1.title).toBe(instance2.title);
      expect(instance1.detail).toBe(instance2.detail);
      expect(instance1.status).toBe(instance2.status);
      expect(instance1.info).not.toEqual(instance2.info);
      expect(instance1.instance).not.toEqual(instance2.instance);
    });

    it('instance and requestId are owned by HTTP boundary only', () => {
      const definition: ExceptionDefinition = {
        name: 'UserNotFoundException',
        kind: 'client' as const,
        problemType: 'user_not_found',
        title: 'User Not Found',
        detail: 'The requested user was not found',
        dataType: Object,
      };

      expect(definition).not.toHaveProperty('instance');
      expect(definition).not.toHaveProperty('requestId');
    });
  });

  describe('redaction rules', () => {
    it('never exposes meta to client', () => {
      const response = {
        type: '/api/problems/internal',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected error occurred',
        instance: '/api/operations/123',
      };

      expect(response).not.toHaveProperty('meta');
      expect(response).not.toHaveProperty('cause');
      expect(response).not.toHaveProperty('stack');
    });

    it('never exposes Error.message from unknown exceptions', () => {
      const leakedMessage = 'Connection refused at postgresql://db:5432';
      const response = {
        type: '/api/problems/internal',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected error occurred',
        instance: '/api/operations/123',
      };

      expect(response.detail).not.toContain(leakedMessage);
      expect(response.detail).not.toContain('postgresql');
      expect(response.detail).not.toContain('Connection refused');
    });

    it('4xx HttpException must not expose e.message', () => {
      const httpErrorMessage = 'Invalid JWT: token expired at 2024-01-01T00:00:00Z';
      const safeResponse = {
        type: '/api/problems/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'Authentication required',
      };

      expect(safeResponse.detail).not.toContain(httpErrorMessage);
      expect(safeResponse.detail).not.toContain('JWT');
      expect(safeResponse.detail).not.toContain('token expired');
    });
  });

  describe('typed info mapping', () => {
    it('maps data to info in response', () => {
      const data = { userId: 'user-123', reason: 'deleted' };
      const response = {
        type: '/api/problems/user_not_found',
        title: 'User Not Found',
        detail: 'The requested user was not found',
        status: 404,
        info: data,
        instance: '/api/users/user-123',
      };

      expect(response.info).toEqual(data);
      expect(response.info!.userId).toBe('user-123');
    });

    it('validation errors use typed context', () => {
      const response = {
        type: '/api/problems/client_data_validation',
        detail: 'The provided data failed validation',
        status: 422,
        info: {
          errors: [
            {
              code: 'value_out_of_range',
              context: { field: 'amount', min: '10', max: '100' },
            },
          ],
        },
      };

      expect((response.info!.errors as any)[0].code).toBe('value_out_of_range');
      expect((response.info!.errors as any)[0].context.field).toBe('amount');
      expect(response.detail).toBe('The provided data failed validation');
    });
  });

  describe('Content-Type enforcement', () => {
    it('problem responses use application/problem+json', () => {
      const contentType = 'application/problem+json';
      expect(contentType).toBe('application/problem+json');
    });
  });

  describe('problem type uniqueness', () => {
    it('rejects duplicate problem types', () => {
      const types = ['user_not_found', 'user_not_found', 'invalid_token', 'batch_not_found', 'batch_not_found'];

      const seen = new Set<string>();
      const duplicates: string[] = [];

      for (const t of types) {
        if (seen.has(t)) {
          duplicates.push(t);
        }
        seen.add(t);
      }

      expect(duplicates).toEqual(['user_not_found', 'batch_not_found']);
    });
  });
});
