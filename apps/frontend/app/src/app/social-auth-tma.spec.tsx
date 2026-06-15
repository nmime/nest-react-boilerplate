import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    resetPath();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetPath();
  });

  it("shows a localized TMA fallback outside Telegram without crashing", async () => {
    resetPath("/tma");
    tma.useRawInitData.mockReturnValue(undefined);

    render(<App />);

    expect(
      await screen.findByText("Open this page inside Telegram to continue."),
    ).toBeTruthy();
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

  it("navigates route links without a full page reload", async () => {
    render(<App />);

    fireEvent.click(screen.getAllByRole("link", { name: "Settings" })[0]);

    await waitFor(() => expect(window.location.pathname).toBe("/settings"));
  });
});
