import { useEffect } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("keeps auth-required API failures on the current route with a runtime overlay", async () => {
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
    expect(screen.getByText(/current route is preserved/i)).toBeTruthy();
  });
});
