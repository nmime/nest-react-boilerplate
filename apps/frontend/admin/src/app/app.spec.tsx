import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchAdminProfile,
  getAdminApiBaseUrl,
} from "@app/frontend-api-client";
import App from "./app";
import {
  ADMIN_TOKEN_STORAGE_KEY,
  createAdminAccess,
  getBearerTokenFromUrl,
  readStoredBearerToken,
  resolveInitialBearerToken,
  saveBearerToken,
} from "./auth-rbac";
import {
  DashboardPage,
  DevTokenForm,
  ForbiddenPage,
  NotFoundPage,
  ProfilePage,
  renderAdminRoute,
} from "./pages";

const mockFetch = (ok: boolean, body: unknown, status = 200) =>
  vi
    .fn<(input: string, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(
      new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json" },
        status: ok ? status : status || 500,
      }),
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

const getRequestHeaders = (
  fetchImpl: ReturnType<typeof mockFetch>,
  index: number,
): Headers => {
  const init = fetchImpl.mock.calls[index]?.[1];

  if (!(init?.headers instanceof Headers)) {
    throw new Error("Missing Headers instance in fetch call.");
  }

  return init.headers;
};

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: createMemoryStorage(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("admin auth and RBAC helpers", () => {
  it("resolves bearer tokens from URL first and localStorage second", () => {
    window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, " stored ");
    expect(getBearerTokenFromUrl("/dashboard?admin_token=from-url")).toBe(
      "from-url",
    );
    expect(readStoredBearerToken(window.localStorage)).toBe("stored");
    expect(resolveInitialBearerToken("/dashboard", window.localStorage)).toBe(
      "stored",
    );
    expect(
      resolveInitialBearerToken(
        "/dashboard?admin_token=from-url",
        window.localStorage,
      ),
    ).toBe("from-url");
  });

  it("stores and clears bearer tokens for the dev form", () => {
    saveBearerToken(window.localStorage, " token ");
    expect(window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)).toBe("token");
    saveBearerToken(window.localStorage, " ");
    expect(window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)).toBeNull();
    saveBearerToken(undefined, "ignored");
    expect(readStoredBearerToken()).toBe("");
  });

  it("builds fail-closed admin access policies", () => {
    expect(createAdminAccess()).toEqual({
      isAuthenticated: false,
      canReadDashboard: false,
      canReadProfile: false,
      roles: [],
      permissions: [],
    });
    expect(
      createAdminAccess({
        subject: "admin-id",
        roles: ["admin", "admin"],
        permissions: ["admin:profile:read", "admin:dashboard:read"],
      }),
    ).toEqual({
      isAuthenticated: true,
      canReadDashboard: true,
      canReadProfile: true,
      roles: ["admin"],
      permissions: ["admin:profile:read", "admin:dashboard:read"],
    });
    expect(
      createAdminAccess({
        subject: "admin-id",
        roles: ["admin"],
        permissions: ["admin:dashboard:read", "admin:profile:read"],
      }),
    ).toMatchObject({ canReadDashboard: true, canReadProfile: true });
    expect(
      createAdminAccess({
        subject: "support-id",
        roles: ["support"],
        permissions: ["admin:dashboard:read", "admin:profile:read"],
      }),
    ).toMatchObject({ canReadDashboard: false, canReadProfile: false });
  });

  it("fetches profile with bearer headers and rejects failed responses", async () => {
    const fetchImpl = mockFetch(true, {
      data: { principal: { subject: "1" } },
    });
    await expect(
      fetchAdminProfile("abc", "en", "/api", fetchImpl),
    ).resolves.toEqual({
      principal: { subject: "1" },
    });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/api/admin/profile/me");
    expect(fetchImpl.mock.calls[0]?.[1]?.body).toBeUndefined();
    const headers = getRequestHeaders(fetchImpl, 0);
    expect(headers.get("Accept-Language")).toBe("en");
    expect(headers.get("Authorization")).toBe("Bearer abc");

    await expect(
      fetchAdminProfile("abc", "en", "", mockFetch(false, {}, 403)),
    ).rejects.toThrow("Profile request failed with 403.");
    await expect(
      fetchAdminProfile("abc", "en", "", mockFetch(true, {})),
    ).resolves.toEqual({});
  });

  it("normalizes admin API base URLs", () => {
    expect(getAdminApiBaseUrl(" https://admin.example/api/ ")).toBe(
      "https://admin.example/api",
    );
    expect(getAdminApiBaseUrl()).toBe("");
  });
});

describe("admin pages", () => {
  const access = createAdminAccess({
    subject: "admin-id",
    roles: ["admin"],
    permissions: ["admin:profile:read", "admin:dashboard:read"],
  });
  const payload = {
    principal: { subject: "admin-id" },
    profile: {
      id: "admin-id",
      email: "admin@example.com",
      displayName: "Ada Admin",
      roles: ["admin"],
      permissions: ["admin:profile:read", "admin:dashboard:read"],
    },
  };

  it("renders dashboard, profile, forbidden, and not-found pages", () => {
    expect(renderToStaticMarkup(<DashboardPage access={access} />)).toContain(
      "Admin dashboard",
    );
    expect(
      renderToStaticMarkup(
        <DashboardPage access={{ ...access, roles: [], permissions: [] }} />,
      ),
    ).toContain("Roles: none");
    expect(renderToStaticMarkup(<ProfilePage payload={payload} />)).toContain(
      "Ada Admin",
    );
    expect(renderToStaticMarkup(<ProfilePage payload={{}} />)).toContain(
      "Administrator",
    );
    expect(
      renderToStaticMarkup(
        <ProfilePage
          payload={{
            profile: {
              id: "profile-id",
              email: "profile@example.com",
              roles: [],
              permissions: [],
            },
          }}
        />,
      ),
    ).toContain("profile@example.com");
    expect(renderToStaticMarkup(<ForbiddenPage reason="Denied" />)).toContain(
      "Denied",
    );
    expect(renderToStaticMarkup(<NotFoundPage />)).toContain(
      "Admin page not found",
    );
  });

  it("submits token values from the development form", () => {
    const onSubmit = vi.fn();

    render(<DevTokenForm onSubmit={onSubmit} />);
    const form = screen.getByLabelText("Development bearer token");

    fireEvent.submit(form);
    expect(onSubmit).toHaveBeenLastCalledWith("");

    screen.getByPlaceholderText("Paste development token").remove();
    fireEvent.submit(form);
    expect(onSubmit).toHaveBeenLastCalledWith("");
  });

  it("routes fail closed for every state", () => {
    expect(
      renderToStaticMarkup(renderAdminRoute("/", { status: "missing-token" })),
    ).toContain("Provide a bearer token");
    expect(
      renderToStaticMarkup(renderAdminRoute("/", { status: "loading" })),
    ).toContain("Loading admin profile...");
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
          access: { ...access, canReadProfile: false },
        }),
      ),
    ).toContain("Missing admin profile permission");
    expect(
      renderToStaticMarkup(
        renderAdminRoute("/dashboard", {
          status: "ready",
          payload,
          access: { ...access, canReadDashboard: false },
        }),
      ),
    ).toContain("Missing admin dashboard permission");
    expect(
      renderToStaticMarkup(
        renderAdminRoute("/nope", { status: "ready", payload, access }),
      ),
    ).toContain("Admin page not found");
  });
});

describe("Admin app shell", () => {
  it("renders missing token state and submits development token", async () => {
    const fetchImpl = mockFetch(true, {
      data: {
        principal: {
          subject: "admin-id",
          roles: ["admin"],
          permissions: ["admin:profile:read", "admin:dashboard:read"],
        },
        profile: {
          id: "admin-id",
          roles: ["admin"],
          permissions: ["admin:profile:read", "admin:dashboard:read"],
        },
      },
    });
    vi.stubGlobal("fetch", fetchImpl);

    render(<App />);
    expect(screen.getByText("Access denied")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Paste development token"), {
      target: { value: "dev-token" },
    });
    fireEvent.submit(screen.getByLabelText("Development bearer token"));

    await waitFor(() =>
      expect(screen.getByText("Admin dashboard")).toBeTruthy(),
    );
    expect(window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)).toBe(
      "dev-token",
    );
  });

  it("loads a URL token, shows profile route, and reports failed fetches", async () => {
    window.history.replaceState(null, "", "/profile?admin_token=url-token");
    vi.stubGlobal(
      "fetch",
      mockFetch(true, {
        data: {
          principal: {
            subject: "admin-id",
            roles: ["admin"],
            permissions: ["admin:profile:read", "admin:dashboard:read"],
          },
          profile: {
            id: "admin-id",
            email: "admin@example.com",
            roles: ["admin"],
            permissions: ["admin:profile:read", "admin:dashboard:read"],
          },
        },
      }),
    );

    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("admin@example.com")).toBeTruthy(),
    );

    window.history.replaceState(null, "", "/?admin_token=bad-token");
    vi.stubGlobal("fetch", mockFetch(false, {}, 401));
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("Profile request failed with 401.")).toBeTruthy(),
    );
  });

  it("fails closed for missing principals and persists locale updates", async () => {
    window.history.replaceState(null, "", "/?admin_token=missing-principal");
    const fetchImpl = vi
      .fn<(input: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: {} }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { user: { locale: "es" } } }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              principal: {
                subject: "admin-id",
                roles: ["admin"],
                permissions: ["admin:profile:read", "admin:dashboard:read"],
              },
            },
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        ),
      );
    vi.stubGlobal("fetch", fetchImpl);

    render(<App />);
    await waitFor(() =>
      expect(
        screen.getByText("Authenticated principal is missing."),
      ).toBeTruthy(),
    );

    fireEvent.change(screen.getByLabelText("Language"), {
      target: { value: "es" },
    });

    await waitFor(() => {
      const patchCall = fetchImpl.mock.calls.find(
        ([url, init]) => url === "/auth/me/locale" && init?.method === "PATCH",
      );

      expect(patchCall).toBeTruthy();
      expect(screen.getByText("Falta el principal autenticado.")).toBeTruthy();
    });
  });
});
