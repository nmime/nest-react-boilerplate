import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiFetch,
  ApiFetchResponseError,
  getRawFetch,
  normalizeApiBaseUrl,
} from "./api-fetch";

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: ok ? status : status || 500,
  });

const createFetchMock = () =>
  vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

const getRequestAt = (
  fetchImpl: ReturnType<typeof createFetchMock>,
  index: number,
): { headers: Headers; init: RequestInit; input: string } => {
  const [input, init] = fetchImpl.mock.calls[index] ?? [];

  if (!(init?.headers instanceof Headers)) {
    throw new Error("Missing Headers instance in fetch call.");
  }

  return { headers: init.headers, init, input };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("normalizes base URLs", () => {
    expect(normalizeApiBaseUrl(" https://api.example/ ")).toBe(
      "https://api.example",
    );
    expect(normalizeApiBaseUrl()).toBe("");
  });

  it("guards access to raw fetch implementations", () => {
    const fetchImpl = createFetchMock();
    expect(getRawFetch(fetchImpl)).toBe(fetchImpl);

    vi.stubGlobal("fetch", undefined);
    expect(() => getRawFetch()).toThrow("Global fetch is not available.");
  });

  it("injects language and JSON defaults", async () => {
    const fetchImpl = createFetchMock().mockResolvedValue(
      jsonResponse({ data: "ok" }),
    );

    await expect(
      apiFetch<{ data: string }>("/profile/me", {
        baseUrl: "https://api.example/",
        body: { locale: "es" },
        fetchImpl,
        locale: "es",
        method: "PATCH",
      }),
    ).resolves.toEqual({ data: "ok" });

    const request = getRequestAt(fetchImpl, 0);
    expect(request.input).toBe("https://api.example/profile/me");
    expect(request.init.body).toBe(JSON.stringify({ locale: "es" }));
    expect(request.init.method).toBe("PATCH");
    expect(request.headers.get("Accept")).toBe("application/json");
    expect(request.headers.get("Accept-Language")).toBe("es");
    expect(request.headers.get("content-type")).toBe("application/json");
  });

  it("returns undefined for 204 responses", async () => {
    const fetchImpl = createFetchMock().mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    await expect(
      apiFetch("/profile/me", { fetchImpl }),
    ).resolves.toBeUndefined();
  });

  it("surfaces response status and payload for failed requests", async () => {
    const fetchImpl = createFetchMock().mockResolvedValue(
      jsonResponse({ detail: "denied" }, false, 403),
    );

    await expect(apiFetch("/profile/me", { fetchImpl })).rejects.toMatchObject({
      responseBody: { detail: "denied" },
      status: 403,
    });
    await expect(apiFetch("/profile/me", { fetchImpl })).rejects.toBeInstanceOf(
      ApiFetchResponseError,
    );
  });
});
