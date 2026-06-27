import { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAuthApiClient, useUserApiClient } from "@app/frontend/api-client";
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

describe("user app API client provider wiring", () => {
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
});
