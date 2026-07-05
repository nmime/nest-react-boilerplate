import { describe, expect, it, vi } from "vitest";

import {
  createAuthRefreshFetch,
  createAuthRefreshMiddleware,
} from "./auth-middleware";
import { createApiRuntimeEventHub } from "./runtime-events";

const invokeOnRequest = async (
  middleware: ReturnType<typeof createAuthRefreshMiddleware>,
  request: Request,
): Promise<Request> =>
  (await middleware.onRequest?.({
    id: "test",
    options: {},
    request,
    schemaPath: "/profile",
  })) as Request;

const invokeOnResponse = async (
  middleware: ReturnType<typeof createAuthRefreshMiddleware>,
  request: Request,
  response: Response,
): Promise<Response | undefined> =>
  (await middleware.onResponse?.({
    id: "test",
    options: {},
    request,
    response,
    schemaPath: "/profile",
  })) as Response | undefined;

const jsonResponse = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });

describe("createAuthRefreshMiddleware onRequest", () => {
  it("skips the Authorization header when the token is blank", async () => {
    const middleware = createAuthRefreshMiddleware({
      clearAuth: vi.fn(),
      getAccessToken: () => "   ",
      refreshAccessToken: vi.fn(),
    });

    const request = await invokeOnRequest(
      middleware,
      new Request("https://api.example.test/profile"),
    );

    expect(request.headers.get("Authorization")).toBeNull();
  });
});

describe("createAuthRefreshMiddleware onResponse", () => {
  it("ignores non-401 responses without attempting a refresh", async () => {
    const refreshAccessToken = vi.fn<() => Promise<null>>();
    const middleware = createAuthRefreshMiddleware({
      clearAuth: vi.fn(),
      getAccessToken: () => "token",
      refreshAccessToken,
    });

    const result = await invokeOnResponse(
      middleware,
      new Request("https://api.example.test/profile"),
      new Response(null, { status: 200 }),
    );

    expect(result).toBeUndefined();
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it("falls back to the raw url and clears auth when the refresh rejects", async () => {
    const eventHub = createApiRuntimeEventHub();
    const clearAuth = vi.fn<() => void>();
    const middleware = createAuthRefreshMiddleware({
      clearAuth,
      eventHub,
      getAccessToken: () => null,
      refreshAccessToken: () => Promise.reject(new Error("refresh boom")),
    });
    // A non-parseable url exercises the requestEndpoint fallback branch.
    const badRequest = {
      method: "GET",
      url: "not a url",
    } as unknown as Request;

    await invokeOnResponse(
      middleware,
      badRequest,
      jsonResponse({ code: "unauthorized" }, 401),
    );

    expect(clearAuth).toHaveBeenCalledTimes(1);
    expect(eventHub.getState()).toMatchObject({ authRequired: true });
    expect(eventHub.getState().lastError?.endpoint).toBe("not a url");
  });

  it("treats a whitespace-only refresh token as a failed refresh", async () => {
    const clearAuth = vi.fn<() => void>();
    const middleware = createAuthRefreshMiddleware({
      clearAuth,
      getAccessToken: () => null,
      refreshAccessToken: () => Promise.resolve("   "),
    });

    await invokeOnResponse(
      middleware,
      new Request("https://api.example.test/profile"),
      new Response(null, { status: 401 }),
    );

    expect(clearAuth).toHaveBeenCalledTimes(1);
  });

  it("retries with an accessToken object result and returns the retry response", async () => {
    const clearAuth = vi.fn<() => void>();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ data: true }, 200));
    const middleware = createAuthRefreshMiddleware({
      clearAuth,
      fetchImpl,
      getAccessToken: () => "expired",
      refreshAccessToken: () => Promise.resolve({ accessToken: " fresh " }),
    });

    const result = await invokeOnResponse(
      middleware,
      new Request("https://api.example.test/profile"),
      new Response(null, { status: 401 }),
    );

    expect(result?.status).toBe(200);
    expect(clearAuth).not.toHaveBeenCalled();
    expect(
      (fetchImpl.mock.calls[0]?.[0] as Request).headers.get("Authorization"),
    ).toBe("Bearer fresh");
  });

  it("clears auth and emits when the retried request is rejected again", async () => {
    const eventHub = createApiRuntimeEventHub();
    const events: string[] = [];
    eventHub.subscribe((event) => events.push(event.type));
    const clearAuth = vi.fn<() => void>();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ code: "still-unauthorized" }, 401));
    const middleware = createAuthRefreshMiddleware({
      clearAuth,
      eventHub,
      fetchImpl,
      getAccessToken: () => "expired",
      refreshAccessToken: () => Promise.resolve("fresh"),
    });

    const result = await invokeOnResponse(
      middleware,
      new Request("https://api.example.test/profile", { method: "GET" }),
      new Response(null, { status: 401 }),
    );

    expect(result?.status).toBe(401);
    expect(clearAuth).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["auth-required"]);
  });
});

describe("createAuthRefreshFetch", () => {
  it("clears auth when the retried request is still unauthorized", async () => {
    const clearAuth = vi.fn<() => void>();
    const baseFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 401 }));
    const refreshFetch = createAuthRefreshFetch({
      baseFetch,
      clearAuth,
      refreshAccessToken: () => Promise.resolve("fresh"),
    });

    const response = await refreshFetch(
      new Request("https://api.example.test/profile", {
        headers: { Authorization: "Bearer expired" },
      }),
    );

    expect(response.status).toBe(401);
    expect(clearAuth).toHaveBeenCalledTimes(1);
    expect(baseFetch).toHaveBeenCalledTimes(2);
  });
});
