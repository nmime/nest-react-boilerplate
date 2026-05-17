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

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  ({ ok, status, json: () => Promise.resolve(body) }) as Response;

const installStorage = () => {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
};

type FetchReply = Response | { rejectsWith: unknown };

const setFetch = (...responses: FetchReply[]) => {
  const fetchMock = vi.fn();
  for (const response of responses) {
    if ("rejectsWith" in response) {
      fetchMock.mockRejectedValueOnce(response.rejectsWith);
    } else {
      fetchMock.mockResolvedValueOnce(response);
    }
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

type FetchInit = {
  body?: unknown;
  headers?: Record<string, string>;
  method?: string;
};

type FetchMock = ReturnType<typeof setFetch>;

const findFetchInit = (
  fetchMock: FetchMock,
  url: string,
  expectedHeaders: Record<string, string>,
  method?: string,
): FetchInit | undefined =>
  fetchMock.mock.calls.find(([calledUrl, init]) => {
    const fetchInit = init as FetchInit | undefined;

    return (
      calledUrl === url &&
      (!method || fetchInit?.method === method) &&
      Object.entries(expectedHeaders).every(
        ([key, value]) => fetchInit?.headers?.[key] === value,
      )
    );
  })?.[1] as FetchInit | undefined;

const expectFetchRequest = (
  fetchMock: FetchMock,
  url: string,
  expectedHeaders: Record<string, string>,
  method?: string,
): FetchInit => {
  const init = findFetchInit(fetchMock, url, expectedHeaders, method);
  expect(init, `missing ${method ?? "GET"} ${url}`).toBeTruthy();
  expect(init?.headers).toMatchObject({
    Accept: "application/json",
    ...expectedHeaders,
  });

  return init as FetchInit;
};

describe("User app shell", () => {
  beforeEach(() => {
    installStorage();
    window.localStorage.clear();
    document.cookie = "locale=; path=/; max-age=0";
    document.cookie = "lang=; path=/; max-age=0";
    window.history.pushState({}, "", "/");
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("renders auth and profile copy through the shared shell", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("User App");
    expect(html).toContain(
      "Sign in, register, and load your protected profile.",
    );
    expect(html).toContain("Development login/register flow");
    expect(html).toContain("Profile state");
  });

  it("renders static markup without browser globals or usable storage", () => {
    vi.stubGlobal("window", undefined);
    expect(renderToStaticMarkup(<App />)).toContain("User App");
    vi.unstubAllGlobals();
    installStorage();

    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("storage blocked");
      },
    });

    expect(renderToStaticMarkup(<App />)).toContain(
      "Provide a token or use login/register.",
    );
  });

  it("loads a profile from a URL token", async () => {
    window.history.pushState({}, "", "/?token=url-token");
    vi.stubEnv("VITE_USER_API_BASE_URL", "https://user-api/");
    const fetchMock = setFetch(
      jsonResponse({ data: { user: { locale: "en" } } }),
      jsonResponse({
        data: {
          principal: { subject: "subject-id", email: "ready@example.com" },
        },
      }),
    );

    render(<App />);

    expect(await screen.findByText("Ready: ready@example.com")).toBeTruthy();
    expect(window.localStorage.getItem("boilerplate.user.bearerToken")).toBe(
      "url-token",
    );
    expectFetchRequest(fetchMock, "/auth/me", {
      "Accept-Language": "en",
      Authorization: "Bearer url-token",
    });
    expectFetchRequest(fetchMock, "https://user-api/profile/me", {
      "Accept-Language": "en",
      Authorization: "Bearer url-token",
    });
  });

  it("shows forbidden states for profile response and thrown failures", async () => {
    window.history.pushState({}, "", "/?token=bad-token");
    setFetch(jsonResponse({ data: {} }), jsonResponse({}, false, 403));
    const { unmount } = render(<App />);
    expect(
      await screen.findByText("Forbidden: Request failed with 403."),
    ).toBeTruthy();
    unmount();

    window.history.pushState({}, "", "/?token=throw-token");
    setFetch(jsonResponse({ data: {} }), { rejectsWith: "network failed" });
    render(<App />);
    expect(
      await screen.findByText("Forbidden: Profile request failed."),
    ).toBeTruthy();
  });

  it("handles incomplete profile payloads and non-error auth rejections", async () => {
    window.history.pushState({}, "", "/?token=no-profile-token");
    setFetch(jsonResponse({ data: {} }), jsonResponse({ data: {} }));
    const { unmount } = render(<App />);
    expect(await screen.findByText("Ready: unknown")).toBeTruthy();
    unmount();
    cleanup();
    window.localStorage.clear();
    document.cookie = "locale=; path=/; max-age=0";
    document.cookie = "lang=; path=/; max-age=0";
    window.history.pushState({}, "", "/");

    const rejectAuthJson = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValue("auth offline");
    setFetch({
      ok: true,
      status: 200,
      json: rejectAuthJson,
    } as Response);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    await waitFor(() =>
      expect(
        screen.getByText("Provide a token or use login/register."),
      ).toBeTruthy(),
    );
  });

  it("uses saved user locale before profile calls and ignores stale local storage", async () => {
    window.localStorage.setItem("boilerplate.locale", "en");
    window.history.pushState({}, "", "/?token=saved-locale-token");
    vi.stubEnv("VITE_USER_API_BASE_URL", "https://user-api/");
    const fetchMock = setFetch(
      jsonResponse({ data: { user: { locale: "es" } } }),
      jsonResponse({ data: { user: { locale: "es" } } }),
      jsonResponse({ data: { principal: { subject: "profile-subject" } } }),
    );

    render(<App />);

    expect(await screen.findByText("Listo: profile-subject")).toBeTruthy();
    expectFetchRequest(fetchMock, "/auth/me", {
      "Accept-Language": "en",
      Authorization: "Bearer saved-locale-token",
    });
    expectFetchRequest(fetchMock, "/auth/me", {
      "Accept-Language": "es",
      Authorization: "Bearer saved-locale-token",
    });
    expectFetchRequest(fetchMock, "https://user-api/profile/me", {
      "Accept-Language": "es",
      Authorization: "Bearer saved-locale-token",
    });
  });

  it("persists language switches for authenticated users and subsequent calls", async () => {
    window.history.pushState({}, "", "/?token=switch-token");
    const fetchMock = setFetch(
      jsonResponse({ data: { user: { locale: "en" } } }),
      jsonResponse({ data: { principal: { subject: "profile-subject" } } }),
      jsonResponse({ data: { user: { locale: "es" } } }),
      jsonResponse({ data: { user: { locale: "es" } } }),
      jsonResponse({ data: { principal: { subject: "profile-subject" } } }),
    );

    render(<App />);
    expect(await screen.findByText("Ready: profile-subject")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Language"), {
      target: { value: "es" },
    });

    await waitFor(() =>
      expect(
        findFetchInit(
          fetchMock,
          "/auth/me/locale",
          {
            "Accept-Language": "es",
            Authorization: "Bearer switch-token",
            "Content-Type": "application/json",
          },
          "PATCH",
        ),
      ).toBeTruthy(),
    );
    const patchInit = expectFetchRequest(
      fetchMock,
      "/auth/me/locale",
      {
        "Accept-Language": "es",
        Authorization: "Bearer switch-token",
        "Content-Type": "application/json",
      },
      "PATCH",
    );
    expect(patchInit.body).toBe(JSON.stringify({ locale: "es" }));
    await waitFor(() =>
      expect(
        findFetchInit(fetchMock, "/profile/me", {
          "Accept-Language": "es",
          Authorization: "Bearer switch-token",
        }),
      ).toBeTruthy(),
    );
  });

  it("logs in then loads the protected profile", async () => {
    vi.stubEnv("VITE_AUTH_API_BASE_URL", "https://auth-api/");
    setFetch(
      jsonResponse({ data: { accessToken: "login-token" } }),
      jsonResponse({ data: { user: { locale: "en" } } }),
      jsonResponse({ data: { principal: { subject: "profile-subject" } } }),
    );
    render(<App />);

    fireEvent.change(screen.getByLabelText("Login email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Login password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    expect(await screen.findByText("Ready: profile-subject")).toBeTruthy();
  });

  it("handles register failures and empty success tokens", async () => {
    setFetch(jsonResponse({}, false, 409));
    const { unmount } = render(<App />);

    fireEvent.change(screen.getByLabelText("Register display name"), {
      target: { value: "Registered User" },
    });
    fireEvent.change(screen.getByLabelText("Register email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Register password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Register" }));
    expect(
      await screen.findByText("Forbidden: Request failed with 409."),
    ).toBeTruthy();
    unmount();

    setFetch(jsonResponse({ data: {} }));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Login" }));
    await waitFor(() =>
      expect(
        screen.getByText("Provide a token or use login/register."),
      ).toBeTruthy(),
    );
  });
});
