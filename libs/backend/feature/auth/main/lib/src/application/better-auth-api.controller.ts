import { BETTER_AUTH_INSTANCE } from "./better-auth.module";
import { Controller, Inject, Req, Res, All, HttpCode } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Auth } from "better-auth";

/**
 * Better-Auth API proxy controller.
 *
 * Delegates every /api/auth/* request to Better-Auth's own HTTP handler
 * (auth.handler). The handler returns a proper Response with cookies and
 * body. We unwrap its internal context wrapper (identified by the
 * `operationId` field) to extract only the safe response data.
 */
@Controller("api/auth")
export class BetterAuthApiController {
  constructor(@Inject(BETTER_AUTH_INSTANCE) private readonly auth: Auth) {}

  @All("*")
  @HttpCode(200)
  async handle(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const handler = (this.auth as any).handler;
    if (!handler) {
      res.status(500).send({ message: "Better-Auth handler not available" });
      return;
    }

    try {
      // Forward the full Nest path (including /api/auth) as the Better-Auth URL.
      const fullUrl = (req.url || "").startsWith("/")
        ? req.url
        : "/" + (req.url || "");
      const url = new URL(fullUrl, this.getBaseUrl()).toString();

      // Build Headers instance from Fastify headers
      const headers = new Headers();
      for (const [key, value] of Object.entries(
        req.headers as Record<string, string | string[] | undefined>,
      )) {
        if (value && typeof value === "string") {
          headers.set(key, value);
        } else if (Array.isArray(value) && value.length > 0) {
          headers.set(key, value.join(", "));
        }
      }
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }

      // Body for POST/PUT/PATCH
      let body: string | undefined;
      if (
        ["POST", "PUT", "PATCH"].includes(req.method?.toUpperCase() || "") &&
        req.body
      ) {
        body = JSON.stringify(req.body);
      }

      // Delegate to Better-Auth's handler
      const baRequest = new Request(url, {
        method: req.method?.toUpperCase() || "GET",
        headers,
        body,
      });

      const baResponse = await handler(baRequest);

      // Forward status
      res.status(baResponse.status);

      // Forward set-cookie headers
      for (const setCookie of baResponse.headers.getSetCookie()) {
        try {
          res.header("set-cookie", setCookie);
        } catch {
          /* skip malformed */
        }
      }

      // Forward other headers
      for (const [key, value] of baResponse.headers.entries()) {
        if (key.toLowerCase() !== "set-cookie") {
          try {
            res.header(key, value);
          } catch {
            /* skip */
          }
        }
      }

      // Forward body — unwrap context wrapper if present
      const contentType = baResponse.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        let jsonBody: unknown;
        try {
          jsonBody = await baResponse.json();
        } catch {
          res.send({});
          return;
        }

        if (
          jsonBody &&
          typeof jsonBody === "object" &&
          "operationId" in jsonBody
        ) {
          jsonBody = this.unwrapContext(jsonBody as Record<string, unknown>);
        }

        res.send(jsonBody);
      } else {
        const textBody = await baResponse.text();
        res.type("text/plain").send(textBody);
      }
    } catch (error: any) {
      const status = error?.status ?? error?.statusCode ?? 500;
      console.error(
        `[BetterAuthApiController] ${req.method} ${req.url} error:`,
        error?.message ?? String(error),
      );
      res.status(status).send({
        message: error?.message ?? "Internal server error",
        code: error?.code,
      });
    }
  }

  /**
   * Unwrap Better-Auth's internal context wrapper into a clean response body
   * with only user, session, and token fields.
   */
  private unwrapContext(ctx: Record<string, unknown>): Record<string, unknown> {
    const context = (ctx.context ?? {}) as Record<string, unknown>;
    const newSession = (context.newSession ??
      {}) as Record<string, unknown>;
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
      for (const key of ["success", "error", "message"]) {
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
    return (
      process.env.BETTER_AUTH_URL ??
      process.env.API_BASE_URL ??
      "http://localhost:3003"
    );
  }
}
