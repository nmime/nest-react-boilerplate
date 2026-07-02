import { describe, expect, it, vi } from "vitest";

import {
  createAuthRefreshFetch,
  createAuthRefreshMiddleware,
} from "./auth-middleware";
import { FRONTEND_ERROR_KEY } from "./error-normalization";
import { createApiResilienceMiddleware } from "./resilience-middleware";
import { createApiRuntimeFetch } from "./runtime-fetch";
import { createApiRuntimeEventHub } from "./runtime-events";
import {
  ApiToastRuntime,
  parseApiToastRules,
  resolveApiToastRule,
} from "./toast-runtime";

const invokeOnRequest = async (
  middleware: ReturnType<typeof createAuthRefreshMiddleware>,
  request: Request,
): Promise<Request> => {
  const handler = middleware.onRequest;
  if (!handler) {
    throw new Error("onRequest missing");
  }

  return (await handler({
    id: "test",
    options: {},
    request,
    schemaPath: "/profile",
  })) as Request;
};

const invokeOnResponse = async (
  middleware: ReturnType<typeof createApiResilienceMiddleware>,
  request: Request,
  response: Response,
): Promise<Response | undefined> => {
  const handler = middleware.onResponse;
  if (!handler) {
    throw new Error("onResponse missing");
  }

  return (await handler({
    id: "test",
    options: {},
    request,
    response,
    schemaPath: "/profile",
  })) as Response | undefined;
};

describe("API resilience middleware", () => {
  it("wraps generated-client fetches with offline, auth-required, toast, and enriched error handling", async () => {
    const eventHub = createApiRuntimeEventHub();
    const events: string[] = [];
    eventHub.subscribe((event) => events.push(event.type));
    const toastRuntime = new ApiToastRuntime({
      clock: () => 1,
      createId: () => "toast-auth",
      eventHub,
    });
    const authFetch = createApiRuntimeFetch({
      baseFetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ message: "Sign in first" }), {
          headers: { "content-type": "application/json" },
          status: 401,
        }),
      ),
      emitMissingTokenAuthRequired: true,
      eventHub,
      toastRuntime,
    });

    const authResponse = await authFetch("https://api.example.test/profile/me");
    const authBody = (await authResponse.json()) as Record<string, unknown>;

    expect(eventHub.getState()).toMatchObject({
      authRequired: true,
      redirectTo: "/auth",
    });
    expect(authBody[FRONTEND_ERROR_KEY]).toMatchObject({
      kind: "auth",
      message: "Sign in first",
      status: 401,
    });
    expect(events).toContain("auth-required");

    const offlineFetch = createApiRuntimeFetch({
      baseFetch: vi
        .fn<typeof fetch>()
        .mockRejectedValue(new TypeError("offline")),
      eventHub,
      toastRuntime,
    });

    await expect(
      offlineFetch("https://api.example.test/profile/me"),
    ).rejects.toThrow(TypeError);
    expect(eventHub.getState()).toMatchObject({ status: "offline" });
    expect(toastRuntime.visible.at(-1)).toMatchObject({
      category: "warning",
      title: "Connection lost",
    });
  });

  it("normalizes offline failures and 5xx responses into runtime events", async () => {
    const eventHub = createApiRuntimeEventHub();
    const events: string[] = [];
    eventHub.subscribe((event) => events.push(event.type));
    const toastRuntime = new ApiToastRuntime({
      clock: () => 1,
      createId: () => "toast-offline",
      eventHub,
    });
    const middleware = createApiResilienceMiddleware({
      eventHub,
      toastRuntime,
    });
    const request = new Request("https://api.example.test/profile", {
      method: "GET",
    });

    await expect(
      Promise.resolve().then(() =>
        middleware.onError?.({
          error: new TypeError("Failed to fetch"),
          id: "test",
          options: {},
          request,
          schemaPath: "/profile",
        }),
      ),
    ).rejects.toThrow(TypeError);

    expect(eventHub.getState()).toMatchObject({ status: "offline" });
    expect(toastRuntime.visible[0]).toMatchObject({
      category: "warning",
      title: "Connection lost",
    });

    const response = new Response(
      JSON.stringify({ code: "boom", detail: "Database down" }),
      {
        headers: { "content-type": "application/json" },
        status: 503,
        statusText: "Service Unavailable",
      },
    );

    const enriched = await invokeOnResponse(middleware, request, response);
    const body = (await enriched?.json()) as Record<string, unknown>;

    expect(events).toEqual([
      "network-offline",
      "toast",
      "server-error",
      "toast",
    ]);
    expect(eventHub.getState()).toMatchObject({ status: "server-error" });
    expect(body[FRONTEND_ERROR_KEY]).toMatchObject({
      code: "boom",
      endpoint: "/profile",
      kind: "server",
      message: "Database down",
      method: "GET",
      status: 503,
    });
  });

  it("matches toast rules from JSON and keeps at most three visible toasts", () => {
    let now = 100;
    let nextId = 0;
    const runtime = new ApiToastRuntime({
      clock: () => now,
      createId: () => {
        nextId += 1;
        return `toast-${nextId}`;
      },
    });
    const rules = parseApiToastRules([
      {
        display: "toast",
        id: "profile.saved",
        match: { endpoint: "/profile", method: "PATCH", status: 200 },
        toast: { category: "success", title: "Profile saved" },
      },
      { id: "invalid", match: {}, toast: { category: "not-real" } },
    ]);

    expect(
      resolveApiToastRule(
        { endpoint: "/profile", method: "patch", status: 200 },
        rules,
      ),
    ).toMatchObject({ id: "profile.saved" });

    expect(
      runtime.showForApiResult(
        { endpoint: "/profile", method: "PATCH", status: 200 },
        rules,
      ),
    ).toMatchObject({ category: "success", title: "Profile saved" });

    expect(
      runtime.showForApiResult(
        { endpoint: "/profile", method: "PATCH", status: 200 },
        rules,
      ),
    ).toBeNull();

    now += 5000;
    runtime.show({ category: "info", title: "One" });
    runtime.show({ category: "warning", title: "Two" });
    runtime.show({ category: "error", title: "Three" });

    expect(runtime.visible).toHaveLength(3);
    expect(runtime.visible.map((toast) => toast.title)).toEqual([
      "One",
      "Two",
      "Three",
    ]);
  });
});

describe("auth refresh middleware", () => {
  it("shares one refresh promise across parallel 401s and retries with the new token", async () => {
    const eventHub = createApiRuntimeEventHub();
    const refreshAccessToken = vi
      .fn<() => Promise<string>>()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve("fresh"), 1)),
      );
    const clearAuth = vi.fn<() => void>();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const middleware = createAuthRefreshMiddleware({
      clearAuth,
      eventHub,
      fetchImpl: fetchMock,
      getAccessToken: () => "expired",
      refreshAccessToken,
    });
    const requestA = await invokeOnRequest(
      middleware,
      new Request("https://api.example.test/a"),
    );
    const requestB = await invokeOnRequest(
      middleware,
      new Request("https://api.example.test/b"),
    );

    expect(requestA.headers.get("Authorization")).toBe("Bearer expired");

    const responses = await Promise.all([
      middleware.onResponse?.({
        id: "a",
        options: {},
        request: requestA,
        response: new Response(null, { status: 401 }),
        schemaPath: "/a",
      }),
      middleware.onResponse?.({
        id: "b",
        options: {},
        request: requestB,
        response: new Response(null, { status: 401 }),
        schemaPath: "/b",
      }),
    ]);

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(clearAuth).not.toHaveBeenCalled();
    expect(responses.every((response) => response instanceof Response)).toBe(
      true,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      (fetchMock.mock.calls[0]?.[0] as Request).headers.get("Authorization"),
    ).toBe("Bearer fresh");
  });

  it("clears auth and emits redirect/auth-required when refresh fails", async () => {
    const eventHub = createApiRuntimeEventHub();
    const events: string[] = [];
    eventHub.subscribe((event) => events.push(event.type));
    const clearAuth = vi.fn<() => void>();
    const middleware = createAuthRefreshMiddleware({
      clearAuth,
      eventHub,
      getAccessToken: () => null,
      redirectTo: "/sign-in",
      refreshAccessToken: () => Promise.resolve(null),
    });
    const request = new Request("https://api.example.test/profile", {
      method: "GET",
    });
    const response = new Response(JSON.stringify({ code: "unauthorized" }), {
      headers: { "content-type": "application/json" },
      status: 401,
    });

    await middleware.onResponse?.({
      id: "auth",
      options: {},
      request,
      response,
      schemaPath: "/profile",
    });

    expect(clearAuth).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["auth-required"]);
    expect(eventHub.getState()).toMatchObject({
      authRequired: true,
      redirectTo: "/sign-in",
    });
  });

  it("single-flights refresh across parallel 401 responses in the fetch wrapper", async () => {
    const refreshAccessToken = vi
      .fn<() => Promise<string>>()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve("fresh"), 1)),
      );
    const clearAuth = vi.fn<() => void>();
    const baseFetch = vi.fn<typeof fetch>().mockImplementation((input) => {
      const request = input as Request;
      return Promise.resolve(
        request.headers.get("Authorization") === "Bearer fresh"
          ? new Response(JSON.stringify({ data: true }), { status: 200 })
          : new Response(null, { status: 401 }),
      );
    });

    const refreshFetch = createAuthRefreshFetch({
      baseFetch,
      clearAuth,
      refreshAccessToken,
    });

    const responses = await Promise.all([
      refreshFetch(
        new Request("https://api.example.test/a", {
          headers: { Authorization: "Bearer expired" },
        }),
      ),
      refreshFetch(
        new Request("https://api.example.test/b", {
          headers: { Authorization: "Bearer expired" },
        }),
      ),
    ]);

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(clearAuth).not.toHaveBeenCalled();
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(baseFetch).toHaveBeenCalledTimes(4);
  });

  it("clears auth and returns the original 401 when the fetch wrapper cannot refresh", async () => {
    const clearAuth = vi.fn<() => void>();
    const baseFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 401 }));

    const refreshFetch = createAuthRefreshFetch({
      baseFetch,
      clearAuth,
      refreshAccessToken: () => Promise.resolve(null),
    });

    const response = await refreshFetch(
      new Request("https://api.example.test/profile", {
        headers: { Authorization: "Bearer expired" },
      }),
    );

    expect(clearAuth).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(401);
    expect(baseFetch).toHaveBeenCalledTimes(1);
  });

  it("does not attempt refresh for unauthenticated 401 responses", async () => {
    const refreshAccessToken = vi.fn<() => Promise<string>>();
    const baseFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 401 }));

    const refreshFetch = createAuthRefreshFetch({
      baseFetch,
      clearAuth: vi.fn<() => void>(),
      refreshAccessToken,
    });

    const response = await refreshFetch("https://api.example.test/login", {
      method: "POST",
    });

    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
  });
});
