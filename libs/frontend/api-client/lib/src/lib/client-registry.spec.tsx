import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ApiClientProvider,
  createApiClientRegistry,
  useAdminApiClient,
  useAuthApiClient,
  useUserApiClient,
  type generatedAuthApi,
} from "../index";
import type { AuthSessionContract } from "@app/common/api-contracts";

type StableAuthContractImport = Omit<Partial<AuthSessionContract>, "user"> &
  Omit<
    Partial<generatedAuthApi.components["schemas"]["AuthSessionViewDto"]>,
    "user"
  > & {
    user?: Partial<
      generatedAuthApi.components["schemas"]["AuthSessionViewDto"]["user"]
    >;
  };

const Probe = () => {
  const adminClient = useAdminApiClient();
  const authClient = useAuthApiClient();
  const userClient = useUserApiClient();

  return (
    <output data-testid="registry">
      {JSON.stringify({
        adminBaseUrl: adminClient.requestOptions.baseUrl,
        authBaseUrl: authClient.requestOptions.baseUrl,
        authToken: authClient.requestOptions.authToken,
        userBaseUrl: userClient.requestOptions.baseUrl,
      })}
    </output>
  );
};

describe("api client registry", () => {
  it("creates injected auth, user, and admin clients with normalized runtime options", () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const registry = createApiClientRegistry({
      authToken: " token-123 ",
      baseUrls: {
        admin: "https://admin.example.test",
        auth: "https://auth.example.test",
        user: "https://user.example.test",
      },
      fetchImpl,
      headers: { "x-app": "frontend" },
    });

    expect(registry.auth.api.getAuthControllerMeQueryKey()).toEqual([
      "get",
      "/auth/me",
    ]);
    expect(registry.auth.requestOptions).toMatchObject({
      authToken: "token-123",
      baseUrl: "https://auth.example.test",
      fetchImpl,
      headers: { "x-app": "frontend" },
    });
    expect(registry.user.requestOptions.baseUrl).toBe(
      "https://user.example.test",
    );
    expect(registry.admin.requestOptions.baseUrl).toBe(
      "https://admin.example.test",
    );
  });

  it("provides generated clients through React context", () => {
    render(
      <ApiClientProvider
        authToken=" bearer-token "
        baseUrls={{
          admin: "/admin-api",
          auth: "/auth-api",
          user: "/user-api",
        }}
      >
        <Probe />
      </ApiClientProvider>,
    );

    expect(screen.getByTestId("registry").textContent).toBe(
      JSON.stringify({
        adminBaseUrl: "/admin-api",
        authBaseUrl: "/auth-api",
        authToken: "bearer-token",
        userBaseUrl: "/user-api",
      }),
    );
  });

  it("keeps stable public aliases usable for generated contracts and clients", () => {
    const session = {
      accessToken: "access-token",
      expiresIn: 3600,
      tokenType: "Bearer",
      user: { email: "ada@example.com", id: "user-1" },
    } satisfies Partial<StableAuthContractImport>;

    expect(session.tokenType).toBe("Bearer");
  });
});
