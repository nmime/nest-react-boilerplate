import { describe, expect, it, vi } from "vitest";
import {
  ApiError,
  apiFetch,
  apiRequest,
  buildApiHeaders,
  configureApiLocale,
  resolveApiUrl,
  setApiLocale,
} from "./api-client";

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  ({
    headers: new Headers({ "content-type": "application/json" }),
    json: vi.fn().mockResolvedValue(body),
    ok,
    status,
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  }) as unknown as Response;

type CapturedRequestInit = RequestInit & {
  body?: BodyInit | null;
  headers: Record<string, string>;
};

const getCapturedRequest = (
  fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>,
  index: number,
): CapturedRequestInit =>
  fetchImpl.mock.calls[index]?.[1] as CapturedRequestInit;

describe("frontend API client", () => {
  it("injects Accept-Language into every request and updates with the locale getter", async () => {
    let locale: "en" | "es" = "en";
    configureApiLocale({ getLocale: () => locale });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ data: { ok: true } }));

    await apiFetch("/first", { fetchImpl });
    locale = "es";
    await apiFetch("/second", { fetchImpl });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/first");
    expect(getCapturedRequest(fetchImpl, 0).headers).toMatchObject({
      Accept: "application/json",
      "Accept-Language": "en",
    });
    expect(fetchImpl.mock.calls[1]?.[0]).toBe("/second");
    expect(getCapturedRequest(fetchImpl, 1).headers).toMatchObject({
      "Accept-Language": "es",
    });
  });

  it("sets JSON and authorization headers consistently", async () => {
    setApiLocale("es");
    configureApiLocale({ locale: "es" });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}));

    await apiFetch("profile/me", {
      authToken: " token ",
      baseUrl: "https://api.example.test/",
      fetchImpl,
      json: { displayName: "Ada" },
      method: "PATCH",
    });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://api.example.test/profile/me",
    );
    const request = getCapturedRequest(fetchImpl, 0);
    expect(request).toMatchObject({
      body: JSON.stringify({ displayName: "Ada" }),
      method: "PATCH",
    });
    expect(request.headers).toMatchObject({
      Accept: "application/json",
      "Accept-Language": "es",
      Authorization: "Bearer token",
      "Content-Type": "application/json",
    });
  });

  it("uses localized fallback copy when a problem response has no message", async () => {
    configureApiLocale({ locale: "es" });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({}, false, 500));

    await expect(apiFetch("/profile", { fetchImpl })).rejects.toMatchObject({
      body: {},
      message: "La solicitud falló con 500.",
      status: 500,
    } satisfies Partial<ApiError>);
  });

  it("apiRequest returns non-OK responses without throwing", async () => {
    configureApiLocale({ locale: "en" });
    const response = jsonResponse({ detail: "Nope" }, false, 403);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);

    await expect(apiRequest("/profile", { fetchImpl })).resolves.toBe(response);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/profile");
  });

  it("parses problem responses into ApiError", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ detail: "Forbidden profile" }, false, 403),
      );

    await expect(apiFetch("/profile", { fetchImpl })).rejects.toMatchObject({
      body: { detail: "Forbidden profile" },
      message: "Forbidden profile",
      status: 403,
    } satisfies Partial<ApiError>);
  });

  it("builds URLs and headers without letting callers remove Accept-Language", () => {
    configureApiLocale({ locale: "en" });

    expect(resolveApiUrl("profile", "/api/")).toBe("/api/profile");
    expect(resolveApiUrl("/profile", "")).toBe("/profile");
    expect(
      buildApiHeaders({
        authToken: null,
        hasJsonBody: false,
        headers: { "Accept-Language": "es", "x-request-id": "1" },
      }),
    ).toEqual({
      Accept: "application/json",
      "Accept-Language": "en",
      "x-request-id": "1",
    });
  });
});
