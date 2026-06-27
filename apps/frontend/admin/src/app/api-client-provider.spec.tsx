import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAdminApiClient, useAuthApiClient } from "@app/frontend/api-client";
import App from "../App";

const Probe = () => {
  const adminClient = useAdminApiClient();
  const authClient = useAuthApiClient();

  return (
    <output data-testid="admin-api-client-runtime">
      {JSON.stringify({
        adminBaseUrl: adminClient.requestOptions.baseUrl,
        authBaseUrl: authClient.requestOptions.baseUrl,
        authToken: authClient.requestOptions.authToken,
      })}
    </output>
  );
};

describe("admin app API client provider wiring", () => {
  it("injects public generated clients with configured admin/auth base URLs", () => {
    render(<App testChild={<Probe />} />);

    expect(screen.getByTestId("admin-api-client-runtime").textContent).toBe(
      JSON.stringify({
        adminBaseUrl: "",
        authBaseUrl: "",
        authToken: undefined,
      }),
    );
  });
});
