import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./app";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
  });

const createMemoryStorage = (): Storage => {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
};

const getRequestsByPath = (
  fetchImpl: ReturnType<typeof vi.fn>,
  path: string,
  method?: string,
): Request[] =>
  fetchImpl.mock.calls
    .map((call) => call[0] as Request)
    .filter(
      (request) =>
        new URL(request.url).pathname === path &&
        (!method || request.method === method),
    );

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: createMemoryStorage(),
  });
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("admin preference authentication", () => {
  it("reuses the initial URL bearer token for preference updates after scrubbing the URL", async () => {
    window.history.replaceState(null, "", "/profile?token=admin-pref-token");
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            principal: {
              permissions: ["admin:profile:read", "admin:dashboard:read"],
              roles: ["admin"],
              subject: "admin-id",
            },
            user: { locale: "en", theme: "system" },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            principal: {
              permissions: ["admin:profile:read", "admin:dashboard:read"],
              roles: ["admin"],
              subject: "admin-id",
            },
            profile: {
              email: "admin@example.com",
              id: "admin-id",
              permissions: ["admin:profile:read", "admin:dashboard:read"],
              roles: ["admin"],
            },
          },
        }),
      )
      .mockImplementation(() =>
        Promise.resolve(
          jsonResponse({ data: { locale: "ru", theme: "dark" } }),
        ),
      );
    vi.stubGlobal("fetch", fetchImpl);

    render(<App />);

    await waitFor(() =>
      expect(screen.getByText("admin@example.com")).toBeTruthy(),
    );
    expect(window.location.search).toBe("");

    fireEvent.change(screen.getByLabelText("Language"), {
      target: { value: "ru" },
    });
    fireEvent.change(screen.getByLabelText(/^(Theme|Тема)$/u), {
      target: { value: "dark" },
    });

    await waitFor(() =>
      expect(
        getRequestsByPath(fetchImpl, "/auth/me/preferences", "PATCH").length,
      ).toBeGreaterThanOrEqual(2),
    );

    const preferenceRequests = getRequestsByPath(
      fetchImpl,
      "/auth/me/preferences",
      "PATCH",
    );
    expect(preferenceRequests[0]?.headers.get("authorization")).toBe(
      "Bearer admin-pref-token",
    );
    expect(preferenceRequests[1]?.headers.get("authorization")).toBe(
      "Bearer admin-pref-token",
    );
    await expect(preferenceRequests[0]?.clone().json()).resolves.toEqual({
      locale: "ru",
    });
    await expect(preferenceRequests[1]?.clone().json()).resolves.toEqual({
      theme: "dark",
    });
  });
});
