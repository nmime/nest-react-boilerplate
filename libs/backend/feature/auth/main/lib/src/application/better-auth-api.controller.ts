import { BetterAuthInstanceToken, getBaseUrl } from './better-auth.module';
import { Controller, Inject, Req, Res, All, HttpCode, HttpException, Logger, Optional } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Auth } from 'better-auth';
import { BaseException, InternalException } from '@app/backend-common-exception';
import { DefaultAuthTenantId, type AuthenticatedRequest } from '@app/backend-feature-auth-shared';
import { AuthLoginAnalyticsService } from './auth-login-analytics.service';

const UnsafeForwardedResponseHeaders = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

@Controller('api/auth')
export class BetterAuthApiController {
  private static readonly log = new Logger(BetterAuthApiController.name);
  constructor(
    @Inject(BetterAuthInstanceToken) private readonly auth: Auth,
    @Optional() private readonly loginAnalytics?: AuthLoginAnalyticsService,
  ) {}

  @All('*')
  @HttpCode(200)
  async handle(@Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const handler = this.auth.handler;
    if (!handler) {
      throw new InternalException({ reason: 'better_auth_handler_unavailable' });
    }

    try {
      // Forward the full Nest path (including /api/auth) as the Better-Auth URL.
      const fullUrl = (req.url || '').startsWith('/') ? req.url : '/' + (req.url || '');
      const url = new URL(fullUrl, this.getBaseUrl()).toString();

      // Build Headers instance from Fastify headers
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers as Record<string, string | string[] | undefined>)) {
        if (value && typeof value === 'string') {
          headers.set(key, value);
        } else if (Array.isArray(value) && value.length > 0) {
          headers.set(key, value.join(', '));
        }
      }
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }

      // Body for POST/PUT/PATCH
      let body: string | undefined;
      if (['POST', 'PUT', 'PATCH'].includes(req.method?.toUpperCase() || '') && req.body) {
        body = JSON.stringify(req.body);
      }

      // Delegate to Better-Auth's handler
      const baRequest = new Request(url, {
        method: req.method?.toUpperCase() || 'GET',
        headers,
        body,
      });

      const baResponse = await handler(baRequest);

      if (baResponse.status >= 400) {
        throw new HttpException('', baResponse.status);
      }

      // Forward status
      res.status(baResponse.status);

      // Forward all cookies as one Fastify header value. Repeated calls to
      // reply.header can overwrite earlier cookies on real adapters.
      const setCookies = baResponse.headers.getSetCookie();
      if (setCookies.length > 0) {
        res.header('set-cookie', setCookies);
      }

      // Forward other headers
      for (const [key, value] of baResponse.headers.entries()) {
        if (key.toLowerCase() !== 'set-cookie' && !UnsafeForwardedResponseHeaders.has(key.toLowerCase())) {
          try {
            res.header(key, value);
          } catch {
            /* skip */
          }
        }
      }

      // Forward body — unwrap context wrapper if present
      const contentType = baResponse.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        let jsonBody: unknown;
        try {
          jsonBody = await baResponse.json();
        } catch {
          res.send({});
          return;
        }

        if (jsonBody && typeof jsonBody === 'object' && 'operationId' in jsonBody) {
          jsonBody = this.unwrapContext(jsonBody as Record<string, unknown>);
        }

        await this.recordSuccessfulSession(req, jsonBody);

        res.send(jsonBody);
      } else {
        const textBody = await baResponse.text();
        res.type('text/plain').send(textBody);
      }
    } catch (error: unknown) {
      await this.recordFailedSession(req);
      const err = error instanceof Error ? error : new Error(String(error));

      if (error instanceof BaseException || error instanceof HttpException) {
        throw error;
      }

      BetterAuthApiController.log.error(`${req.method} ${req.url} error: ${err.message}`, err.stack);

      const candidateStatus =
        (error as { status?: unknown; statusCode?: unknown })?.status ??
        (error as { status?: unknown; statusCode?: unknown })?.statusCode;
      if (Number.isInteger(candidateStatus) && Number(candidateStatus) >= 400 && Number(candidateStatus) <= 599) {
        throw new HttpException('', Number(candidateStatus), { cause: err });
      }

      throw new InternalException({ source: 'better-auth' }, err);
    }
  }

  /**
   * Unwrap Better-Auth's internal context wrapper into a clean response body
   * with only user, session, and token fields.
   */
  private unwrapContext(ctx: Record<string, unknown>): Record<string, unknown> {
    const context = (ctx.context ?? {}) as Record<string, unknown>;
    const newSession = (context.newSession ?? {}) as Record<string, unknown>;
    const session = (context.session ?? {}) as Record<string, unknown>;

    const out: Record<string, unknown> = {};
    if (newSession.user || session.user) {
      out.user = newSession.user || session.user;
    }
    if (newSession.session || session.session) {
      out.session = newSession.session || session.session;
    }
    if (newSession.token || session.token) {
      out.token = newSession.token || session.token;
    }

    // For sign-out and similar endpoints that don't return user/session
    if (Object.keys(out).length === 0) {
      for (const key of ['success', 'error', 'message']) {
        if (key in ctx) {
          try {
            JSON.stringify(ctx[key]);
            out[key] = ctx[key];
          } catch {
            /* skip */
          }
        }
      }
    }

    return out;
  }

  private getBaseUrl(): string {
    return getBaseUrl();
  }

  private async recordSuccessfulSession(req: FastifyRequest, body: unknown): Promise<void> {
    const route = betterAuthSessionRoute(req.url);
    const record = asRecord(body);
    const session = asRecord(record?.session);
    const user = asRecord(record?.user);
    if (!route || (!session && !user)) {
      return;
    }
    const requestBody = asRecord(req.body);
    await this.loginAnalytics?.record({
      request: req as unknown as AuthenticatedRequest,
      tenantId:
        stringValue(user?.tenantId) ??
        stringValue(session?.tenantId) ??
        stringValue(requestBody?.tenantId) ??
        DefaultAuthTenantId,
      userId: stringValue(user?.id) ?? stringValue(session?.userId),
      identifier: stringValue(user?.email) ?? stringValue(requestBody?.email),
      sessionId: stringValue(session?.id),
      eventType: route.eventType,
      outcome: 'success',
      provider: route.provider,
      channel: route.channel,
      language: stringValue(user?.locale),
    });
  }

  private async recordFailedSession(req: FastifyRequest): Promise<void> {
    const route = betterAuthSessionRoute(req.url);
    if (!route) {
      return;
    }
    const requestBody = asRecord(req.body);
    await this.loginAnalytics?.record({
      request: req as unknown as AuthenticatedRequest,
      tenantId: stringValue(requestBody?.tenantId) ?? DefaultAuthTenantId,
      identifier: stringValue(requestBody?.email),
      eventType: route.eventType,
      outcome: 'failure',
      provider: route.provider,
      channel: route.channel,
      failureCode: 'better_auth_rejected',
    });
  }
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

function betterAuthSessionRoute(url: string | undefined): {
  eventType: 'login' | 'registration';
  provider: string;
  channel: string;
} | null {
  const path = (url ?? '').split('?')[0] ?? '';
  const signUp = path.includes('/sign-up/');
  const signIn = path.includes('/sign-in/');
  const callback = path.includes('/callback/');
  if (!signUp && !signIn && !callback) {
    return null;
  }
  const provider =
    path
      .split('/')
      .filter(Boolean)
      .at(-1)
      ?.replace(/[^a-z0-9_-]/giu, '')
      .slice(0, 32) || 'unknown';
  return {
    eventType: signUp ? 'registration' : 'login',
    provider,
    channel: `better_auth_${provider}`.slice(0, 64),
  };
}
