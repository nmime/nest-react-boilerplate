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
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
    statusText: ok ? "OK" : "Error",
  });

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
  body?: BodyInit | null;
  headers?: Record<string, string>;
  method?: string;
};

type FetchMock = ReturnType<typeof setFetch>;
type FetchCall = [unknown, unknown?];

const getCalledUrl = (calledInput: unknown): string =>
  calledInput instanceof Request ? calledInput.url : String(calledInput);

const getCalledInit = (calledInput: unknown, init: unknown): FetchInit => {
  if (calledInput instanceof Request) {
    return {
      body: calledInput.body,
      headers: Object.fromEntries(calledInput.headers.entries()),
      method: calledInput.method,
    };
  }

  return init ?? {};
};

const matchesUrl = (actualUrl: string, expectedUrl: string): boolean => {
  if (actualUrl === expectedUrl) {
    return true;
  }

  if (expectedUrl.startsWith("/")) {
    try {
      return new URL(actualUrl).pathname === expectedUrl;
    } catch {
      return false;
    }
  }

  return false;
};

const findFetchCall = (
  fetchMock: FetchMock,
  url: string,
  expectedHeaders: Record<string, string>,
  method?: string,
): FetchCall | undefined =>
  fetchMock.mock.calls.find(([calledInput, init]) => {
    const fetchInit = getCalledInit(calledInput, init);

    return (
      matchesUrl(getCalledUrl(calledInput), url) &&
      (!method || fetchInit.method === method) &&
      Object.entries(expectedHeaders).every(
        ([key, value]) => fetchInit.headers?.[key.toLowerCase()] === value,
      )
    );
  }) as FetchCall | undefined;

const findFetchInit = (
  fetchMock: FetchMock,
  url: string,
  expectedHeaders: Record<string, string>,
  method?: string,
): FetchInit | undefined => {
  const call = findFetchCall(fetchMock, url, expectedHeaders, method);

  return call ? getCalledInit(call[0], call[1]) : undefined;
};

const readFetchBody = async (
  fetchMock: FetchMock,
  url: string,
  expectedHeaders: Record<string, string>,
  method?: string,
): Promise<string | undefined> => {
  const call = findFetchCall(fetchMock, url, expectedHeaders, method);
  if (!call) {
    return undefined;
  }

  if (call[0] instanceof Request) {
    return call[0].clone().text();
  }

  const body = getCalledInit(call[0], call[1]).body;
  return typeof body === "string" ? body : undefined;
};

const expectFetchRequest = (
  fetchMock: FetchMock,
  url: string,
  expectedHeaders: Record<string, string>,
  method?: string,
): FetchInit => {
  const init = findFetchInit(fetchMock, url, expectedHeaders, method);
  expect(init, `missing ${method ?? "GET"} ${url}`).toBeTruthy();
  expect(init?.headers).toMatchObject(
    Object.fromEntries(
      Object.entries({
        Accept: "application/json",
        ...expectedHeaders,
      }).map(([key, value]) => [key.toLowerCase(), value]),
    ),
  );

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
      headers: new Headers({ "Content-Type": "application/json" }),
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
      jsonResponse({ data: { locale: "ru" } }),
      jsonResponse({ data: { user: { locale: "ru" } } }),
      jsonResponse({ data: { principal: { subject: "profile-subject" } } }),
    );

    render(<App />);

    expect(await screen.findByText("Готово: profile-subject")).toBeTruthy();
    expectFetchRequest(fetchMock, "/auth/me", {
      "Accept-Language": "en",
      Authorization: "Bearer saved-locale-token",
    });
    expectFetchRequest(fetchMock, "/auth/me", {
      "Accept-Language": "ru",
      Authorization: "Bearer saved-locale-token",
    });
    expectFetchRequest(fetchMock, "https://user-api/profile/me", {
      "Accept-Language": "ru",
      Authorization: "Bearer saved-locale-token",
    });
  });

  it("persists language switches for authenticated users and subsequent calls", async () => {
    window.history.pushState({}, "", "/?token=switch-token");
    const fetchMock = setFetch(
      jsonResponse({ data: { user: { locale: "en" } } }),
      jsonResponse({ data: { principal: { subject: "profile-subject" } } }),
      jsonResponse({ data: { user: { locale: "ru" } } }),
      jsonResponse({ data: { user: { locale: "ru" } } }),
      jsonResponse({ data: { principal: { subject: "profile-subject" } } }),
    );

    render(<App />);
    expect(await screen.findByText("Ready: profile-subject")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Language"), {
      target: { value: "ru" },
    });

    await waitFor(() =>
      expect(
        findFetchInit(
          fetchMock,
          "/auth/me/preferences",
          {
            "Accept-Language": "ru",
            Authorization: "Bearer switch-token",
            "Content-Type": "application/json",
          },
          "PATCH",
        ),
      ).toBeTruthy(),
    );
    expectFetchRequest(
      fetchMock,
      "/auth/me/preferences",
      {
        "Accept-Language": "ru",
        Authorization: "Bearer switch-token",
        "Content-Type": "application/json",
      },
      "PATCH",
    );
    await expect(
      readFetchBody(
        fetchMock,
        "/auth/me/preferences",
        {
          "Accept-Language": "ru",
          Authorization: "Bearer switch-token",
          "Content-Type": "application/json",
        },
        "PATCH",
      ),
    ).resolves.toBe(JSON.stringify({ locale: "ru" }));
    await waitFor(() =>
      expect(
        findFetchInit(fetchMock, "/profile/me", {
          "Accept-Language": "ru",
          Authorization: "Bearer switch-token",
        }),
      ).toBeTruthy(),
    );
  });

  it("persists theme switches for authenticated users", async () => {
    window.history.pushState({}, "", "/?token=theme-token");
    const fetchMock = setFetch(
      jsonResponse({ data: { user: { locale: "en", theme: "system" } } }),
      jsonResponse({ data: { principal: { subject: "profile-subject" } } }),
      jsonResponse({ data: { theme: "dark" } }),
      jsonResponse({ data: { user: { locale: "en", theme: "dark" } } }),
      jsonResponse({ data: { principal: { subject: "profile-subject" } } }),
    );

    render(<App />);
    expect(await screen.findByText("Ready: profile-subject")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Theme"), {
      target: { value: "dark" },
    });

    await waitFor(() =>
      expect(
        findFetchInit(
          fetchMock,
          "/auth/me/preferences",
          {
            "Accept-Language": "en",
            Authorization: "Bearer theme-token",
            "Content-Type": "application/json",
          },
          "PATCH",
        ),
      ).toBeTruthy(),
    );
    await expect(
      readFetchBody(
        fetchMock,
        "/auth/me/preferences",
        {
          "Accept-Language": "en",
          Authorization: "Bearer theme-token",
          "Content-Type": "application/json",
        },
        "PATCH",
      ),
    ).resolves.toBe(JSON.stringify({ theme: "dark" }));
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
    fireEvent.change(
      screen.getByLabelText(/^(Register email|Email de registro)$/u),
      {
        target: { value: "new@example.com" },
      },
    );
    fireEvent.change(
      screen.getByLabelText(/^(Register password|Contraseña de registro)$/u),
      {
        target: { value: "password123" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^(Register|Registrarse)$/u }),
    );
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

  it("continues after auth/me failures and uses object error details", async () => {
    window.history.pushState({}, "", "/?token=retry-token");
    setFetch(
      { rejectsWith: new Error("auth offline") },
      jsonResponse({ data: { profile: { email: "after-auth@example.com" } } }),
    );
    const { unmount } = render(<App />);
    expect(
      await screen.findByText("Ready: after-auth@example.com"),
    ).toBeTruthy();
    unmount();

    window.history.pushState({}, "", "/?token=object-error-token");
    setFetch(jsonResponse({ data: {} }), {
      rejectsWith: { detail: "Object detail" },
    });
    render(<App />);
    expect(await screen.findByText("Forbidden: Object detail")).toBeTruthy();
  });

  it("applies profile locales and auth success locale/theme payloads", async () => {
    window.history.pushState({}, "", "/?token=profile-locale-token");
    setFetch(
      jsonResponse({ data: { user: { locale: "en", theme: "light" } } }),
      jsonResponse({
        data: {
          profile: { email: "locale@example.com", locale: "ru", theme: "blue" },
        },
      }),
      jsonResponse({ data: { user: { locale: "ru", theme: "light" } } }),
      jsonResponse({
        data: {
          profile: { email: "locale@example.com", locale: "ru", theme: "blue" },
        },
      }),
    );
    const { unmount } = render(<App />);
    expect(await screen.findByText("Готово: locale@example.com")).toBeTruthy();
    unmount();

    setFetch(
      jsonResponse({
        data: { accessToken: "register-token", locale: "ru", theme: "dark" },
      }),
      jsonResponse({ data: { user: { locale: "ru", theme: "dark" } } }),
      jsonResponse({ data: { profile: { email: "registered@example.com" } } }),
    );
    render(<App />);
    screen
      .getByLabelText(/^(Register display name|Отображаемое имя для регистрации)$/u)
      .remove();
    fireEvent.change(
      screen.getByLabelText(/^(Register email|Email для регистрации)$/u),
      {
        target: { value: "registered@example.com" },
      },
    );
    fireEvent.change(
      screen.getByLabelText(/^(Register password|Пароль для регистрации)$/u),
      {
        target: { value: "password123" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^(Register|Зарегистрироваться)$/u }),
    );

    expect(
      await screen.findByText("Готово: registered@example.com"),
    ).toBeTruthy();
  });
});
