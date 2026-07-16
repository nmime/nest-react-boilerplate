import { BetterAuthInstanceToken, getBaseUrl } from './better-auth.module';
import { Controller, Inject, Req, Res, All, HttpCode, Logger } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Auth } from 'better-auth';

@Controller('api/auth')
export class BetterAuthApiController {
  private static readonly log = new Logger(BetterAuthApiController.name);
  constructor(@Inject(BetterAuthInstanceToken) private readonly auth: Auth) {}

  @All('*')
  @HttpCode(200)
  async handle(@Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const handler = this.auth.handler;
    if (!handler) {
      res.status(500).send({ message: 'Better-Auth handler not available' });
      return;
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
        if (key.toLowerCase() !== 'set-cookie') {
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

        res.send(jsonBody);
      } else {
        const textBody = await baResponse.text();
        res.type('text/plain').send(textBody);
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      const status =
        (error as { status?: number; statusCode?: number })?.status ??
        (error as { status?: number; statusCode?: number })?.statusCode ??
        500;
      BetterAuthApiController.log.error(`${req.method} ${req.url} error: ${err.message}`, err.stack);
      res.status(status).send({
        message: status >= 500 ? 'Internal server error' : err.message,
      });
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
}
