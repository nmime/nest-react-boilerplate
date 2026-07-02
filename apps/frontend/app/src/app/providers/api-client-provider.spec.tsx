import { useEffect } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthApiClient, useUserApiClient } from "@app/frontend/api-client";
import { resetApiRuntimeForOnline } from "@app/frontend/api-support";
import { useAuthShellStore } from "@app/frontend/ui";
import { AppProviders } from "./app-providers";

const TokenSeeder = () => {
  const authStore = useAuthShellStore();

  useEffect(() => {
    authStore.setBearerToken(" seeded-token ");
  }, [authStore]);

  return null;
};

const Probe = () => {
  const authClient = useAuthApiClient();
  const userClient = useUserApiClient();

  return (
    <output data-testid="api-client-runtime">
      {JSON.stringify({
        authBaseUrl: authClient.requestOptions.baseUrl,
        authToken: authClient.requestOptions.authToken,
        userBaseUrl: userClient.requestOptions.baseUrl,
      })}
    </output>
  );
};

const AuthRequiredProbe = () => {
  const userClient = useUserApiClient();

  useEffect(() => {
    void userClient.requestOptions.fetchImpl?.(
      "https://api.example.test/profile/me",
      {
        headers: { Authorization: "Bearer expired-token" },
      },
    );
  }, [userClient.requestOptions]);

  return null;
};

describe("user app API client provider wiring", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    cleanup();
    resetApiRuntimeForOnline();
    vi.unstubAllGlobals();
  });
  it("injects public generated clients with configured auth/user base URLs", async () => {
    render(
      <AppProviders>
        <TokenSeeder />
        <Probe />
      </AppProviders>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("api-client-runtime").textContent).toBe(
        JSON.stringify({
          authBaseUrl: "",
          authToken: "seeded-token",
          userBaseUrl: "",
        }),
      ),
    );
  });

  it("redirects auth-required API failures to auth with a return URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ message: "session expired" }), {
            headers: { "content-type": "application/json" },
            status: 401,
          }),
        ),
      ),
    );

    render(
      <AppProviders>
        <AuthRequiredProbe />
      </AppProviders>,
    );

    await waitFor(() => expect(window.location.pathname).toBe("/auth"));
    expect(new URLSearchParams(window.location.search).get("returnUrl")).toBe(
      "/",
    );
    expect(screen.queryByText("Authentication required")).toBeNull();
  });

  it("keeps auth-required failures in Telegram Mini App routes", async () => {
    window.history.pushState({}, "", "/tma/auth");
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ message: "session expired" }), {
            headers: { "content-type": "application/json" },
            status: 401,
          }),
        ),
      ),
    );

    render(
      <AppProviders>
        <AuthRequiredProbe />
      </AppProviders>,
    );

    expect(await screen.findByText("Authentication required")).toBeTruthy();
    expect(window.location.pathname).toBe("/tma/auth");
  });
});
