import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App, { renderAdminRoute } from "../App";
import {
  type AdminProfilePayload,
  createAdminAccess,
  getAuthApiBaseUrl,
  normalizeClaimList,
  getAdminApiBaseUrl,
} from "../entities/admin-session";
import { getBrowserPath } from "../features/admin-auth";
import { DashboardPage } from "../pages/dashboard";
import { ForbiddenPage } from "../pages/forbidden";
import { NotFoundPage } from "../pages/not-found";
import { ProfilePage } from "../pages/profile";

type FrontendEnvRecord = Record<string, boolean | string | undefined>;

const mockFetch = (ok: boolean, body: unknown, status = 200) =>
  vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
        status,
        statusText: ok ? "OK" : "Error",
      }),
    ),
  );

const getRequest = (fetchImpl: ReturnType<typeof mockFetch>): Request =>
  fetchImpl.mock.calls[0]?.[0] as Request;

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

function installRadixPointerMocks() {
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
    configurable: true,
    value: vi.fn(() => false),
  });
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
}

const profilePayload = {
  principal: {
    subject: "admin-1",
    email: "admin@example.com",
    roles: ["admin"],
    permissions: [
      "admin:dashboard:read",
      "admin:profile:read",
      "admin:users:read",
      "admin:roles:read",
      "admin:audit:read",
    ],
  },
  profile: {
    id: "profile-1",
    displayName: "Ada Admin",
    email: "admin@example.com",
    locale: "fr",
    theme: "dark",
  },
};

const access = createAdminAccess(profilePayload.principal);
const payload = profilePayload;
const emptyProfilePayload: AdminProfilePayload = {};

describe("App", () => {
  beforeEach(() => {
    installRadixPointerMocks();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createMemoryStorage(),
    });
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: createMemoryStorage(),
    });
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.stubEnv("VITE_ADMIN_API_BASE_URL", "https://admin.example.test");
    vi.stubEnv("VITE_AUTH_API_BASE_URL", "https://auth.example.test");
    vi.stubEnv("VITE_API_BASE_URL_MODE", undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the admin dashboard from live profile and summary responses", async () => {
    const fetchImpl = mockFetch(true, profilePayload);
    vi.stubGlobal("fetch", fetchImpl);
    vi.spyOn(window.history, "replaceState").mockImplementation(
      () => undefined,
    );

    render(<App />);

    expect(
      (await screen.findAllByText("Admin dashboard")).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Users").length).toBeGreaterThan(0);
    expect(getRequest(fetchImpl).url).toBe("https://auth.example.test/auth/me");
  });

  it("uses same-origin configured API base URLs", () => {
    vi.stubEnv("VITE_API_BASE_URL_MODE", "same-origin");
    vi.stubEnv("VITE_ADMIN_API_BASE_URL", undefined);
    vi.stubEnv("VITE_AUTH_API_BASE_URL", undefined);

    expect(getAdminApiBaseUrl(import.meta.env as FrontendEnvRecord)).toBe("");
    expect(getAuthApiBaseUrl(import.meta.env as FrontendEnvRecord)).toBe("");
  });

  it("preserves admin route filters while stripping sensitive token query params", () => {
    window.history.pushState(
      null,
      "",
      "/admin/users?search=ada&token=secret&status=active",
    );

    expect(getBrowserPath()).toBe("/admin/users?search=ada&status=active");
    expect(window.location.search).toBe("?search=ada&status=active");
    window.history.pushState(null, "", "/");
  });

  it("requires admin and auth API base URLs when same-origin mode is disabled", () => {
    vi.stubEnv("VITE_ADMIN_API_BASE_URL", undefined);
    vi.stubEnv("VITE_AUTH_API_BASE_URL", undefined);
    vi.stubEnv("VITE_API_BASE_URL_MODE", undefined);

    expect(getAdminApiBaseUrl(import.meta.env as FrontendEnvRecord)).toBe("");
    expect(getAuthApiBaseUrl(import.meta.env as FrontendEnvRecord)).toBe("");
  });

  it("applies auth locale/theme before profile locale/theme and persists user choices", async () => {
    const fetchImpl = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/auth/me/preferences")) {
        return Promise.resolve(
          new Response(JSON.stringify({ locale: "en", theme: "light" }), {
            headers: { "Content-Type": "application/json" },
            status: 200,
          }),
        );
      }
      if (url.includes("/auth/me")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                user: { locale: "fr", theme: "dark" },
                principal: profilePayload.principal,
              },
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify(profilePayload), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      );
    });
    vi.stubGlobal("fetch", fetchImpl);

    render(<App />);

    expect(
      (await screen.findAllByText("Admin dashboard")).length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("combobox", { name: "Language" }));
    fireEvent.click(await screen.findByRole("option", { name: "English" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Theme" }));
    fireEvent.click(await screen.findByRole("option", { name: "Light" }));

    await waitFor(() =>
      expect(
        getRequestsByPath(fetchImpl, "/auth/me/preferences", "PATCH"),
      ).toHaveLength(1),
    );
    const [themePatch] = getRequestsByPath(
      fetchImpl,
      "/auth/me/preferences",
      "PATCH",
    );
    expect(await themePatch?.clone().json()).toEqual({ theme: "light" });
  });

  it("uses profile locale and theme when auth payload has none", async () => {
    const fetchImpl = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      return Promise.resolve(
        new Response(
          JSON.stringify(
            url.includes("/auth/me")
              ? { data: { principal: profilePayload.principal } }
              : profilePayload,
          ),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchImpl);

    render(<App />);

    expect(
      await screen.findByRole("combobox", { name: "Language" }),
    ).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Theme" })).toBeTruthy();
  });

  it("renders forbidden state when profile request fails or principal lacks admin access", async () => {
    vi.stubGlobal("fetch", mockFetch(false, { message: "Forbidden" }, 403));

    render(<App />);

    expect((await screen.findAllByText("Forbidden")).length).toBeGreaterThan(0);
  });

  it("normalizes RBAC claims and renders page components", () => {
    expect(normalizeClaimList(["a", "a", "", 1])).toEqual(["a"]);
    expect(createAdminAccess(profilePayload.principal).canReadUsers).toBe(true);

    expect(renderToStaticMarkup(<DashboardPage access={access} />)).toContain(
      "Admin dashboard",
    );
    expect(
      renderToStaticMarkup(
        <DashboardPage access={{ ...access, roles: [], permissions: [] }} />,
      ),
    ).toContain("Roles: none. Permissions: none.");
    expect(renderToStaticMarkup(<ProfilePage payload={payload} />)).toContain(
      "Ada Admin",
    );
    expect(
      renderToStaticMarkup(<ProfilePage payload={emptyProfilePayload} />),
    ).toContain("Profile");
    expect(
      renderToStaticMarkup(
        <ProfilePage
          payload={{ profile: { email: "fallback@example.com" } }}
        />,
      ),
    ).toContain("fallback@example.com");
    expect(
      renderToStaticMarkup(
        <ProfilePage payload={{ profile: { id: "p-1" } }} />,
      ),
    ).toContain("p-1");
    expect(
      renderToStaticMarkup(
        <ProfilePage
          payload={{ principal: { roles: ["admin"], permissions: ["read"] } }}
        />,
      ),
    ).toContain("Subject: unknown");
    expect(renderToStaticMarkup(<ForbiddenPage reason="Denied" />)).toContain(
      "Denied",
    );
    expect(renderToStaticMarkup(<NotFoundPage />)).toContain(
      "Admin page not found",
    );
  });

  it("renders async dashboard errors and admin route states", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch(true, {}));

    expect(renderToStaticMarkup(<DashboardPage access={access} />)).toContain(
      "Admin dashboard",
    );
    expect(
      renderToStaticMarkup(renderAdminRoute("/", { status: "loading" })),
    ).toContain("Loading admin profile");
    expect(
      renderToStaticMarkup(
        renderAdminRoute("/", { status: "forbidden", reason: "Nope" }),
      ),
    ).toContain("Nope");
    expect(
      renderToStaticMarkup(
        renderAdminRoute("/dashboard", { status: "ready", payload, access }),
      ),
    ).toContain("Admin dashboard");
    expect(
      renderToStaticMarkup(
        renderAdminRoute("/profile", { status: "ready", payload, access }),
      ),
    ).toContain("Ada Admin");
    expect(
      renderToStaticMarkup(
        renderAdminRoute("/profile", {
          status: "ready",
          payload,
          access: { ...access, permissions: [], roles: [] },
        }),
      ),
    ).toContain("Ada Admin");
    expect(
      renderToStaticMarkup(
        renderAdminRoute("/dashboard", {
          status: "ready",
          payload,
          access: { ...access, permissions: [], roles: [] },
        }),
      ),
    ).toContain("Admin dashboard");
    expect(
      renderToStaticMarkup(
        renderAdminRoute("/nope", { status: "ready", payload, access }),
      ),
    ).toContain("Admin page not found");
  });
});
