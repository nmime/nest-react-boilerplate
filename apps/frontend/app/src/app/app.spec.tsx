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
    headers: { "content-type": "application/json" },
    status: ok ? status : status || 500,
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

const createFetchMock = () =>
  vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

const setFetch = (...responses: FetchReply[]) => {
  const fetchMock = createFetchMock();
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
    const authRequest = getRequestAt(fetchMock, 0);
    const profileRequest = getRequestAt(fetchMock, 1);
    expect(authRequest.input).toBe("/auth/me");
    expect(authRequest.init.body).toBeUndefined();
    expect(profileRequest.input).toBe("https://user-api/profile/me");
    expect(profileRequest.init.body).toBeUndefined();
    expect(profileRequest.headers.get("Accept-Language")).toBe("en");
    expect(profileRequest.headers.get("Authorization")).toBe(
      "Bearer url-token",
    );
  });

  it("shows forbidden states for profile response and thrown failures", async () => {
    window.history.pushState({}, "", "/?token=bad-token");
    setFetch(jsonResponse({ data: {} }), jsonResponse({}, false, 403));
    const { unmount } = render(<App />);
    expect(
      await screen.findByText("Forbidden: Profile request failed with 403."),
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

    const fetchMock = setFetch({
      rejectsWith: "auth offline",
    });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    expect(
      await screen.findByText("Forbidden: Authentication failed."),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    const firstRequest = getRequestAt(fetchMock, 0);
    const secondRequest = getRequestAt(fetchMock, 1);
    const thirdRequest = getRequestAt(fetchMock, 2);
    expect(firstRequest.headers.get("Accept-Language")).toBe("en");
    expect(secondRequest.headers.get("Accept-Language")).toBe("es");
    expect(thirdRequest.headers.get("Accept-Language")).toBe("es");
    expect(thirdRequest.input).toBe("https://user-api/profile/me");
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

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    const patchIndex = fetchMock.mock.calls.findIndex(
      ([url, init]) => url === "/auth/me/locale" && init?.method === "PATCH",
    );
    expect(patchIndex).toBeGreaterThanOrEqual(0);
    const patchRequest = getRequestAt(fetchMock, patchIndex);
    expect(patchRequest.headers.get("Accept-Language")).toBe("es");
    expect(patchRequest.headers.get("Authorization")).toBe(
      "Bearer switch-token",
    );
    expect(patchRequest.headers.get("content-type")).toBe("application/json");
    const profileCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "/profile/me",
    );
    expect(profileCalls.length).toBeGreaterThanOrEqual(2);
    let latestProfileIndex = -1;
    for (const [index, [url]] of fetchMock.mock.calls.entries()) {
      if (url === "/profile/me") {
        latestProfileIndex = index;
      }
    }
    const latestProfileRequest = getRequestAt(fetchMock, latestProfileIndex);
    expect(latestProfileRequest.headers.get("Accept-Language")).toBe("es");
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
      await screen.findByText("Forbidden: register failed with 409."),
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
