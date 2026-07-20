import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { InternalException } from '@app/backend-common-exception';
import { BetterAuthApiController } from './better-auth-api.controller';

const BETTER_AUTH_TOKEN = 'BetterAuthInstanceToken';

describe('BetterAuthApiController', () => {
  let controller: BetterAuthApiController;
  type AuthHandler = (request: Request) => Promise<Response>;
  let mockHandler: ReturnType<typeof vi.fn<AuthHandler>>;

  const createMockAuth = (handlerFn: AuthHandler) => ({
    handler: handlerFn,
    api: {},
  });

  beforeEach(async () => {
    mockHandler = vi.fn<AuthHandler>();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BetterAuthApiController],
      providers: [
        {
          provide: BETTER_AUTH_TOKEN,
          useValue: createMockAuth(mockHandler),
        },
      ],
    }).compile();

    controller = module.get<BetterAuthApiController>(BetterAuthApiController);
  });

  describe('unwrapContext', () => {
    it('extracts user, session, token from newSession context', () => {
      const wrapper = {
        operationId: 'signUpWithEmailAndPassword',
        context: {
          newSession: {
            user: { id: 'u1', email: 'a@b.c', name: 'Alice' },
            session: { id: 's1', token: 'tok1' },
            token: 'tok1',
          },
        },
        path: '/sign-up/email',
        method: 'POST',
      };
      const result = (controller as any).unwrapContext(wrapper);
      expect(result.user).toEqual({ id: 'u1', email: 'a@b.c', name: 'Alice' });
      expect(result.session).toEqual({ id: 's1', token: 'tok1' });
      expect(result.token).toBe('tok1');
    });

    it('extracts user, session from session context (get-session)', () => {
      const wrapper = {
        operationId: 'getSession',
        context: {
          session: {
            user: { id: 'u2', email: 'bob@b.c', name: 'Bob' },
            session: { id: 's2', token: 'tok2' },
          },
        },
      };
      const result = (controller as any).unwrapContext(wrapper);
      expect(result.user).toEqual({ id: 'u2', email: 'bob@b.c', name: 'Bob' });
      expect(result.session).toEqual({ id: 's2', token: 'tok2' });
    });

    it('returns success field for sign-out', () => {
      const wrapper = {
        operationId: 'signOut',
        success: true,
        context: {},
      };
      const result = (controller as any).unwrapContext(wrapper);
      expect(result.success).toBe(true);
      expect('user' in result).toBe(false);
      expect('session' in result).toBe(false);
    });

    it('returns empty object when no data found', () => {
      const wrapper = {
        operationId: 'unknown',
        context: {},
        path: '/unknown',
      };
      const result = (controller as any).unwrapContext(wrapper);
      expect(result).toEqual({});
    });

    it('prefers newSession over session when both present', () => {
      const wrapper = {
        operationId: 'signUp',
        context: {
          session: {
            user: { id: 'old' },
            session: { id: 'old' },
            token: 'old',
          },
          newSession: {
            user: { id: 'new' },
            session: { id: 'new' },
            token: 'new',
          },
        },
      };
      const result = (controller as any).unwrapContext(wrapper);
      expect(result.user).toEqual({ id: 'new' });
      expect(result.session).toEqual({ id: 'new' });
      expect(result.token).toBe('new');
    });
  });

  describe('handle', () => {
    const createMockRes = () => {
      const headers: Record<string, string[]> = {};
      let statusCode = 200;
      let body: unknown;
      const mockRes = {
        status: (code: number) => {
          statusCode = code;
          return mockRes;
        },
        header: (name: string, value: string | string[]) => {
          headers[name] = [...(headers[name] || []), ...(Array.isArray(value) ? value : [value])];
          return mockRes;
        },
        send: (data: unknown) => {
          body = data;
          return mockRes;
        },
        type: () => mockRes,
        get statusCode() {
          return statusCode;
        },
        get headers() {
          return headers;
        },
        getBody: () => body,
      } as any;
      return mockRes;
    };

    let mockRes: ReturnType<typeof createMockRes>;

    beforeEach(() => {
      mockRes = createMockRes();
    });

    it('delegates to handler and forwards response body', async () => {
      mockHandler.mockResolvedValue(
        new Response(JSON.stringify({ user: { id: 'u1' }, session: { id: 's1' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const req = {
        method: 'POST',
        url: '/api/auth/sign-up/email',
        headers: { 'content-type': 'application/json' },
        body: { email: 'a@b.c', name: 'Alice', password: 'pass' },
      } as any;

      await controller.handle(req, mockRes);

      expect(mockHandler).toHaveBeenCalledTimes(1);
      expect(mockRes.statusCode).toBe(200);
      expect(mockRes.getBody()).toEqual({ user: { id: 'u1' }, session: { id: 's1' } });
    });

    it('unwraps operationId context from handler response', async () => {
      mockHandler.mockResolvedValue(
        new Response(
          JSON.stringify({
            operationId: 'signUpWithEmailAndPassword',
            context: {
              newSession: {
                user: { id: 'u1', email: 'a@b.c' },
                session: { id: 's1', token: 'tok1' },
                token: 'tok1',
              },
            },
            path: '/sign-up/email',
            method: 'POST',
            body: { email: 'a@b.c', name: 'Alice', password: 'pass' },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );

      const req = {
        method: 'POST',
        url: '/api/auth/sign-up/email',
        headers: { 'content-type': 'application/json' },
        body: { email: 'a@b.c', name: 'Alice', password: 'pass' },
      } as any;

      await controller.handle(req, mockRes);

      expect(mockRes.statusCode).toBe(200);
      const body = mockRes.getBody();
      expect(body).toHaveProperty('user');
      expect(body).toHaveProperty('session');
      expect(body).toHaveProperty('token');
      expect((body as any).user.email).toBe('a@b.c');
    });

    it('forwards set-cookie headers', async () => {
      const res = new Response(JSON.stringify({}), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
      res.headers.append('set-cookie', 'session=abc123; Path=/; HttpOnly');
      mockHandler.mockResolvedValue(res);

      const req = {
        method: 'GET',
        url: '/api/auth/get-session',
        headers: {},
      } as any;

      await controller.handle(req, mockRes);
      expect(mockRes.headers['set-cookie']).toBeDefined();
      expect(mockRes.headers['set-cookie'][0]).toContain('session=abc123');
    });

    it('does not forward transport or stale representation headers', async () => {
      mockHandler.mockResolvedValue(
        new Response(JSON.stringify({ operationId: 'signOut', success: true, context: {} }), {
          status: 200,
          headers: {
            connection: 'keep-alive',
            'content-length': '9999',
            'content-type': 'application/json',
            'x-auth-version': '1',
          },
        }),
      );

      await controller.handle({ method: 'POST', url: '/api/auth/sign-out', headers: {} } as any, mockRes);

      expect(mockRes.headers.connection).toBeUndefined();
      expect(mockRes.headers['content-length']).toBeUndefined();
      expect(mockRes.headers['x-auth-version']).toEqual(['1']);
      expect(mockRes.getBody()).toEqual({ success: true });
    });

    it('handles null response for get-session without auth', async () => {
      mockHandler.mockResolvedValue(
        new Response('null', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const req = {
        method: 'GET',
        url: '/api/auth/get-session',
        headers: {},
      } as any;

      await controller.handle(req, mockRes);
      expect(mockRes.statusCode).toBe(200);
      expect(mockRes.getBody()).toBeNull();
    });

    it('throws a safe typed 500 when handler is missing', async () => {
      (controller as any).auth = {};

      const req = { method: 'GET', url: '/api/auth/get-session' } as any;
      const res = createMockRes();

      await expect(controller.handle(req, res)).rejects.toBeInstanceOf(InternalException);
      expect(res.getBody()).toBeUndefined();
    });

    it('builds correct URL with /api/auth prefix preserved', async () => {
      mockHandler.mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const req = {
        method: 'POST',
        url: '/api/auth/sign-up/email',
        headers: { 'content-type': 'application/json' },
        body: { email: 'a@b.c' },
      } as any;

      await controller.handle(req, mockRes);
      const callArgs = mockHandler.mock.calls[0]?.[0];
      expect(callArgs?.url).toContain('/api/auth/sign-up/email');
    });

    it('builds GET request without body', async () => {
      mockHandler.mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const req = {
        method: 'GET',
        url: '/api/auth/get-session?foo=bar',
        headers: {},
      } as any;

      await controller.handle(req, mockRes);
      const callArgs = mockHandler.mock.calls[0]?.[0];
      expect(callArgs?.method).toBe('GET');
      expect(callArgs?.body).toBeNull();
    });

    it('routes upstream client errors through the global problem filter', async () => {
      mockHandler.mockResolvedValue(
        new Response(
          JSON.stringify({
            message: 'validation failed',
            code: 'VALIDATION_ERROR',
          }),
          {
            status: 400,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );

      const req = {
        method: 'POST',
        url: '/api/auth/telegram/tma',
        headers: { 'content-type': 'application/json' },
        body: { payload: 'bad' },
      } as any;

      await expect(controller.handle(req, mockRes)).rejects.toMatchObject({ status: 400 });
      expect(mockRes.getBody()).toBeUndefined();
    });

    it('converts unexpected handler errors to a safe typed 500', async () => {
      mockHandler.mockRejectedValue(new Error('handler blew up'));

      const req = {
        method: 'GET',
        url: '/api/auth/get-session',
        headers: {},
      } as any;

      await expect(controller.handle(req, mockRes)).rejects.toBeInstanceOf(InternalException);
      expect(mockRes.getBody()).toBeUndefined();
    });
  });

  describe('getBaseUrl', () => {
    it('uses BETTER_AUTH_URL env var', () => {
      process.env.BETTER_AUTH_URL = 'http://test:9999';
      const result = (controller as any).getBaseUrl();
      expect(result).toBe('http://test:9999');
      delete process.env.BETTER_AUTH_URL;
    });

    it('falls back to API_BASE_URL', () => {
      process.env.API_BASE_URL = 'http://api:8888';
      const result = (controller as any).getBaseUrl();
      expect(result).toBe('http://api:8888');
      delete process.env.API_BASE_URL;
    });

    it('defaults to localhost:3003', () => {
      delete process.env.BETTER_AUTH_URL;
      delete process.env.API_BASE_URL;
      const result = (controller as any).getBaseUrl();
      expect(result).toBe('http://localhost:3003');
    });
  });
});
