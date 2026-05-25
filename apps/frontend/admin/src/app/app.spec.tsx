import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./app";
import {
  createAdminAccess,
  fetchAdminProfile,
  getAdminApiBaseUrl,
} from "./auth-rbac";
import {
  DashboardPage,
  ForbiddenPage,
  NotFoundPage,
  ProfilePage,
  renderAdminRoute,
} from "./pages";

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

const createRequestFromFetchCall = (
  call: Parameters<typeof fetch>,
): Request => {
  const [input, init] = call;

  return input instanceof Request ? input : new Request(input, init);
};

const getRequest = (fetchImpl: ReturnType<typeof mockFetch>): Request =>
  createRequestFromFetchCall(
    fetchImpl.mock.calls[0] as Parameters<typeof fetch>,
  );

const getRequestsByPath = (
  fetchImpl: ReturnType<typeof vi.fn>,
  path: string,
  method?: string,
): Request[] =>
  fetchImpl.mock.calls
    .map((call) => createRequestFromFetchCall(call as Parameters<typeof fetch>))
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

  it("fetches the credentialed profile endpoint and rejects failed responses", async () => {
    const fetchImpl = mockFetch(true, {
      data: { principal: { subject: "1" } },
    });
    vi.stubGlobal("fetch", fetchImpl);
    await expect(fetchAdminProfile("/api")).resolves.toEqual({
      principal: { subject: "1" },
    });
    const request = getRequest(fetchImpl);
    expect(request.url).toBe(`${window.location.origin}/api/admin/profile/me`);
    expect(request.method).toBe("GET");
    expect(request.credentials).toBe("include");
    expect(Object.fromEntries(request.headers.entries())).toMatchObject({
      accept: "application/json",
      "accept-language": "en",
    });
    expect(request.headers.has("authorization")).toBe(false);

    vi.stubGlobal("fetch", mockFetch(false, {}, 403));
    await expect(fetchAdminProfile()).rejects.toThrow(
      "Request failed with 403.",
    );
    vi.stubGlobal("fetch", mockFetch(true, {}));
    await expect(fetchAdminProfile()).resolves.toEqual({});
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

  it("routes fail closed for every state", () => {
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
  it("loads the credentialed session profile without browser token persistence", async () => {
    window.history.replaceState(
      null,
      "",
      `/profile?${"admin" + "_token"}=legacy&token=legacy&keep=1`,
    );
    const fetchImpl = mockFetch(true, {
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
    });
    vi.stubGlobal("fetch", fetchImpl);

    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("admin@example.com")).toBeTruthy(),
    );

    expect(window.location.pathname).toBe("/profile");
    expect(window.location.search).toBe("?keep=1");
    expect(window.localStorage.length).toBe(0);
    const profileRequest = getRequestsByPath(
      fetchImpl,
      "/admin/profile/me",
      "GET",
    )[0];
    expect(profileRequest?.credentials).toBe("include");
    expect(profileRequest?.headers.has("authorization")).toBe(false);
  });

  it("reports failed credentialed profile fetches", async () => {
    vi.stubGlobal("fetch", mockFetch(false, {}, 401));

    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("Request failed with 401.")).toBeTruthy(),
    );
  });

  it("fails closed for missing principals and non-Error profile failures", async () => {
    vi.stubGlobal("fetch", mockFetch(true, { data: {} }));

    render(<App />);
    await waitFor(() =>
      expect(
        screen.getByText("Authenticated principal is missing."),
      ).toBeTruthy(),
    );

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("offline"));
    render(<App />);

    await waitFor(() =>
      expect(screen.getByText("Profile request failed.")).toBeTruthy(),
    );
  });

  it("sends authenticated language and theme preference updates through /auth/me/preferences", async () => {
    window.history.replaceState(null, "", "/profile");
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              principal: {
                subject: "admin-id",
                roles: ["admin"],
                permissions: ["admin:profile:read", "admin:dashboard:read"],
              },
              user: { locale: "en", theme: "system" },
            },
          }),
        ),
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
              profile: {
                id: "admin-id",
                email: "admin@example.com",
                roles: ["admin"],
                permissions: ["admin:profile:read", "admin:dashboard:read"],
              },
            },
          }),
        ),
      )
      .mockResolvedValue(
        new Response(JSON.stringify({ data: { locale: "es", theme: "dark" } })),
      );
    vi.stubGlobal("fetch", fetchImpl);

    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("admin@example.com")).toBeTruthy(),
    );

    fireEvent.change(screen.getByLabelText("Language"), {
      target: { value: "es" },
    });
    fireEvent.change(screen.getByLabelText(/^(Theme|Tema)$/u), {
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
    await expect(preferenceRequests[0]?.clone().json()).resolves.toEqual({
      locale: "es",
    });
    await expect(preferenceRequests[1]?.clone().json()).resolves.toEqual({
      theme: "dark",
    });
  });
});
