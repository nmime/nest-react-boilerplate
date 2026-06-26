import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./app";

vi.mock("@tma.js/sdk-react", async () => {
  const actual =
    await vi.importActual<typeof import("@tma.js/sdk-react")>(
      "@tma.js/sdk-react",
    );
  return {
    ...actual,
    backButton: {
      hide: vi.fn(),
      mount: vi.fn(),
      onClick: vi.fn(() => vi.fn()),
      show: vi.fn(),
    },
    init: vi.fn(),
    miniApp: {
      bindCssVars: vi.fn(),
      mount: vi.fn(),
      ready: vi.fn(),
    },
    useLaunchParams: vi.fn(() => ({})),
    useRawInitData: vi.fn(() => undefined),
    viewport: {
      bindCssVars: vi.fn(),
      expand: vi.fn(),
      mount: vi.fn(),
    },
  };
});

const tma = vi.mocked(await import("@tma.js/sdk-react"));

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
    statusText: ok ? "OK" : "Error",
  });

const deferredResponse = () => {
  let resolveResponse!: (value: Response) => void;
  const promise = new Promise<Response>((resolve) => {
    resolveResponse = resolve;
  });

  return { promise, resolve: resolveResponse };
};

const setFetch = (...responses: Response[]) => {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(response);
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const resetPath = (path = "/") => {
  window.history.replaceState(null, "", path);
};

describe("social auth and TMA UI", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_AUTH_API_BASE_URL", "https://auth-api");
    vi.stubEnv("VITE_USER_API_BASE_URL", "https://user-api");
    vi.stubEnv("VITE_API_BASE_URL_MODE", undefined);
    tma.useLaunchParams.mockReturnValue({});
    tma.useRawInitData.mockReturnValue(undefined);
    resetPath();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetPath();
  });

  it.each(["/tma", "/tma/auth", "/telegram-mini-app"])(
    "shows a localized TMA fallback outside Telegram on %s without crashing",
    async (path) => {
      resetPath(path);
      tma.useRawInitData.mockReturnValue(undefined);

      render(<App />);

      expect(
        await screen.findByText("Open this page inside Telegram to continue."),
      ).toBeTruthy();
      expect(screen.getByText("Loading Telegram Mini App…")).toBeTruthy();
    },
  );

  it("uses same-origin API URLs for Telegram Mini App verification when configured", async () => {
    resetPath("/telegram-mini-app");
    vi.stubEnv("VITE_API_BASE_URL_MODE", "same-origin");
    vi.stubEnv("VITE_AUTH_API_BASE_URL", undefined);
    vi.stubEnv("VITE_USER_API_BASE_URL", undefined);
    tma.useRawInitData.mockReturnValue("query_id=raw&hash=same-origin");
    const fetchMock = setFetch(jsonResponse({}, false, 409));

    render(<App />);

    expect(await screen.findByText("Request failed with 409.")).toBeTruthy();
    expect(fetchMock.mock.calls).toHaveLength(1);
    const input = fetchMock.mock.calls[0]?.[0];
    const url = input instanceof Request ? input.url : String(input);
    expect(new URL(url, window.location.origin).pathname).toBe(
      "/auth/telegram/tma",
    );
    expect(new URL(url, window.location.origin).pathname).not.toBe("/");
  });

  it("keeps Telegram auth on the launch route when verification fails", async () => {
    resetPath("/tma/auth");
    tma.useRawInitData.mockReturnValue("query_id=raw&hash=bad");
    tma.useLaunchParams.mockReturnValue({ tgWebAppStartParam: "settings" });
    const fetchMock = setFetch(jsonResponse({}, false, 401));

    render(<App />);

    expect(await screen.findByText("Request failed with 401.")).toBeTruthy();
    expect(window.location.pathname).toBe("/tma/auth");
    expect(
      fetchMock.mock.calls.some(([input]) =>
        (input instanceof Request ? input.url : String(input)).includes(
          "/auth/telegram/tma",
        ),
      ),
    ).toBe(true);
  });

  it("submits Telegram Mini App auth through the documented /telegram-mini-app route", async () => {
    resetPath("/telegram-mini-app");
    tma.useRawInitData.mockReturnValue("query_id=raw&hash=route");
    const fetchMock = setFetch(jsonResponse({}, false, 409));

    render(<App />);

    expect(await screen.findByText("Request failed with 409.")).toBeTruthy();
    expect(window.location.pathname).toBe("/telegram-mini-app");
    expect(
      fetchMock.mock.calls.some(([input]) =>
        (input instanceof Request ? input.url : String(input)).includes(
          "/auth/telegram/tma",
        ),
      ),
    ).toBe(true);
  });

  it("shows Telegram verification loading until the backend responds", async () => {
    resetPath("/tma/auth");
    tma.useRawInitData.mockReturnValue("query_id=raw&hash=hash");
    const pending = deferredResponse();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(pending.promise);
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("Loading Telegram Mini App…")).toBeTruthy();
    pending.resolve(jsonResponse({}, false, 409));
    expect(await screen.findByText("Request failed with 409.")).toBeTruthy();
  });

  it("submits raw TMA initData to backend, stores session, and navigates", async () => {
    resetPath("/tma/auth");
    tma.useRawInitData.mockReturnValue("query_id=raw&hash=hash");
    tma.useLaunchParams.mockReturnValue({ tgWebAppStartParam: "profile" });
    const fetchMock = setFetch(
      jsonResponse({
        data: {
          session: {
            accessToken: "tma-session",
            expiresIn: 3600,
            tokenType: "Bearer",
            user: {
              email: "telegram@example.com",
              id: "user-id",
              permissions: [],
              roles: [],
              tenantId: "tenant-id",
              theme: "system",
            },
          },
          status: "authenticated",
        },
      }),
      jsonResponse({ data: { user: { locale: "en" } } }),
      jsonResponse({ data: { profile: { email: "telegram@example.com" } } }),
    );

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/profile"));
    const tmaCall = fetchMock.mock.calls.find(([input]) =>
      (input instanceof Request ? input.url : String(input)).includes(
        "/auth/telegram/tma",
      ),
    );
    const tmaRequest = tmaCall?.[0] as Request | undefined;
    const requestText = (await tmaRequest?.clone().text()) ?? "{}";
    const body = JSON.parse(requestText) as Record<string, unknown>;
    expect(body).toMatchObject({ initData: "query_id=raw&hash=hash" });
    expect(JSON.stringify(body)).not.toContain("initDataUnsafe");
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([input]) =>
            input instanceof Request &&
            input.headers.get("authorization") === "Bearer tma-session",
        ),
      ).toBe(true),
    );
  });

  it("starts Telegram link flow from /link/telegram instead of generic settings", async () => {
    resetPath("/link/telegram");
    tma.useRawInitData.mockReturnValue("query_id=raw&hash=link");
    const fetchMock = setFetch(jsonResponse({}, false, 409));

    render(<App />);

    expect(await screen.findByText("Request failed with 409.")).toBeTruthy();
    const tmaCall = fetchMock.mock.calls.find(([input]) =>
      (input instanceof Request ? input.url : String(input)).includes(
        "/auth/telegram/tma",
      ),
    );
    const tmaRequest = tmaCall?.[0] as Request | undefined;
    const requestText = (await tmaRequest?.clone().text()) ?? "{}";
    const body = JSON.parse(requestText) as Record<string, unknown>;
    expect(body).toMatchObject({
      initData: "query_id=raw&hash=link",
      intent: "link",
      returnUrl: "/settings",
    });
  });

  it("parses TMA startapp link_telegram as a link intent", async () => {
    resetPath("/tma?startapp=link_telegram");
    tma.useRawInitData.mockReturnValue("query_id=raw&hash=startapp");
    const fetchMock = setFetch(jsonResponse({}, false, 409));

    render(<App />);

    expect(await screen.findByText("Request failed with 409.")).toBeTruthy();
    const tmaCall = fetchMock.mock.calls.find(([input]) =>
      (input instanceof Request ? input.url : String(input)).includes(
        "/auth/telegram/tma",
      ),
    );
    const tmaRequest = tmaCall?.[0] as Request | undefined;
    const requestText = (await tmaRequest?.clone().text()) ?? "{}";
    const body = JSON.parse(requestText) as Record<string, unknown>;
    expect(body).toMatchObject({ intent: "link", returnUrl: "/settings" });
  });

  it("renders TMA deep navigation not-found state", async () => {
    resetPath("/tma?startapp=missing_destination");
    tma.useRawInitData.mockReturnValue(undefined);

    render(<App />);

    expect(
      await screen.findByText(
        "The requested Mini App destination was not found.",
      ),
    ).toBeTruthy();
  });

  it("finishes Discord callback through the SPA route", async () => {
    resetPath("/auth/discord/callback?code=discord-code&state=oauth-state");
    const pending = deferredResponse();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(jsonResponse({ data: { user: { locale: "en" } } }))
      .mockResolvedValueOnce(
        jsonResponse({ data: { profile: { email: "discord@example.com" } } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(
      await screen.findByText("Waiting for Discord confirmation."),
    ).toBeTruthy();
    pending.resolve(
      jsonResponse({
        data: {
          session: {
            accessToken: "discord-session",
            expiresIn: 3600,
            tokenType: "Bearer",
            user: {
              email: "discord@example.com",
              id: "user-id",
              permissions: [],
              roles: [],
              tenantId: "tenant-id",
              theme: "system",
            },
          },
          status: "authenticated",
        },
      }),
    );
    await waitFor(() => expect(window.location.pathname).toBe("/profile"));
    expect(
      fetchMock.mock.calls.some(([input]) => {
        const url = input instanceof Request ? input.url : String(input);
        return (
          url.includes("/auth/discord/callback") &&
          url.includes("code=discord-code") &&
          url.includes("state=oauth-state")
        );
      }),
    ).toBe(true);
  });

  it("renders provider-specific Discord callback errors", async () => {
    resetPath("/auth/discord/callback");

    render(<App />);

    expect(
      await screen.findByText(
        "Discord did not return the required sign-in state. Start again.",
      ),
    ).toBeTruthy();
  });

  it("social auth buttons call wrapper-backed redirect logic", async () => {
    resetPath("/auth");

    const fetchMock = setFetch(
      jsonResponse({
        data: { authorizationUrl: "https://discord.example/oauth" },
      }),
    );

    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Continue with Discord" }),
    );

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) =>
          (input instanceof Request ? input.url : String(input)).includes(
            "/auth/discord/authorization-request",
          ),
        ),
      ).toBe(true),
    );
  });

  it("prevents double Discord authorization requests while loading", async () => {
    resetPath("/auth");
    const pending = deferredResponse();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(pending.promise);
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    const discordButton = await screen.findByRole("button", {
      name: "Continue with Discord",
    });
    fireEvent.click(discordButton);
    fireEvent.click(discordButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const loadingDiscordButton = await screen.findByRole("button", {
      name: /Waiting for Discord confirmation\./u,
    });
    expect((loadingDiscordButton as HTMLButtonElement).disabled).toBe(true);
    pending.resolve(jsonResponse({ data: {} }));
  });

  it("routes Telegram social entry to the outside-Telegram fallback", async () => {
    resetPath("/auth");
    tma.useRawInitData.mockReturnValue(undefined);

    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Continue with Telegram" }),
    );

    await waitFor(() => expect(window.location.pathname).toBe("/tma/auth"));
    expect(
      await screen.findByText("Open this page inside Telegram to continue."),
    ).toBeTruthy();
  });

  it("production TMA auth code never reads initDataUnsafe", () => {
    const tmaFeatureSource = readFileSync(
      resolve("src/features/tma-auth/model/use-tma-auth.ts"),
      "utf8",
    );
    const socialApiSource = readFileSync(
      resolve("src/features/social-auth/api/social-auth-api.ts"),
      "utf8",
    );

    expect(tmaFeatureSource).toContain("useRawInitData");
    expect(tmaFeatureSource).not.toContain("initDataUnsafe");
    expect(socialApiSource).not.toContain("initDataUnsafe");
  });

  it("navigates route links without a full page reload", async () => {
    render(<App />);

    fireEvent.click(screen.getAllByRole("link", { name: "Settings" })[0]);

    await waitFor(() => expect(window.location.pathname).toBe("/settings"));
  });
});
