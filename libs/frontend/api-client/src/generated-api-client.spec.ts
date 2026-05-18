import { configureApiLocale } from "@app/frontend-ui";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  authControllerLogin,
  authControllerMe,
  authControllerRegister,
  authControllerUpdateLocale,
  authControllerUpdatePreferences,
  getAuthControllerLocalesQueryKey,
  getAuthControllerMeQueryKey,
  getAuthControllerUpdatePreferencesMutationKey,
  type AuthControllerLoginData,
  type AuthControllerLoginError,
  type AuthControllerUpdatePreferencesData,
  type AuthControllerRegisterData,
  type AuthControllerRegisterError,
  type AuthControllerUpdateLocaleData,
  type AuthSessionViewDto,
  type LoginDto,
  type RegisterDto,
  type UpdateLocaleDto,
  type UpdatePreferencesDto,
  useAuthControllerLoginMutation,
  useAuthControllerRegisterMutation,
  useAuthControllerUpdatePreferencesMutation,
  useAuthControllerUpdateLocaleMutation,
} from "./auth";
import { adminProfileControllerMe } from "./admin";
import {
  ApiClientError,
  isApiClientError,
  throwOnOpenApiError,
  throwOnOpenApiErrorData,
} from "./service-options";
import { profileControllerMe } from "./user";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });

const session: AuthSessionViewDto = {
  accessToken: "access-token",
  expiresIn: 3600,
  tokenType: "Bearer",
  user: {
    email: "ada@example.com",
    id: "user-1",
    permissions: ["profile:read"],
    roles: ["user"],
  },
};

type FetchMock = typeof fetch & {
  mock: { calls: [RequestInfo | URL, RequestInit | undefined][] };
};

const mockFetch = (body: unknown, status = 200): FetchMock =>
  vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    return Promise.resolve(jsonResponse(request.method ? body : body, status));
  }) as unknown as FetchMock;

const firstRequest = (fetchImpl: FetchMock): Request => {
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  return fetchImpl.mock.calls[0][0] as Request;
};

describe("generated api clients", () => {
  it("sends centralized headers and normalized baseUrl for auth, user, and admin clients", async () => {
    configureApiLocale({ locale: "es" });
    const abortController = new AbortController();
    const { signal } = abortController;
    const authFetch = mockFetch({ data: { principal: null, user: null } });

    await authControllerMe({
      authToken: " token-123 ",
      baseUrl: "/api/",
      fetchImpl: authFetch,
      headers: { "x-request-id": "req-1" },
      signal,
    });

    const authRequest = firstRequest(authFetch);
    expect(authRequest.url).toBe(`${globalThis.location.origin}/api/auth/me`);
    expect(authRequest.method).toBe("GET");
    expect(authRequest.headers.get("accept")).toBe("application/json");
    expect(authRequest.headers.get("accept-language")).toBe("es");
    expect(authRequest.headers.get("authorization")).toBe("Bearer token-123");
    expect(authRequest.headers.get("x-request-id")).toBe("req-1");
    expect(authRequest.signal.aborted).toBe(false);
    abortController.abort();
    expect(authRequest.signal.aborted).toBe(true);

    const userFetch = mockFetch({ data: { principal: null, profile: null } });
    await profileControllerMe({
      authToken: "user-token",
      baseUrl: "https://api.example.test/root/",
      fetchImpl: userFetch,
    });
    const userRequest = firstRequest(userFetch);
    expect(userRequest.url).toBe("https://api.example.test/root/profile/me");
    expect(userRequest.headers.get("authorization")).toBe("Bearer user-token");
    expect(userRequest.headers.get("accept-language")).toBe("es");

    const adminFetch = mockFetch({ data: { principal: null, profile: null } });
    await adminProfileControllerMe({
      authToken: "admin-token",
      baseUrl: "https://admin.example.test",
      fetchImpl: adminFetch,
    });
    const adminRequest = firstRequest(adminFetch);
    expect(adminRequest.url).toBe(
      "https://admin.example.test/admin/profile/me",
    );
    expect(adminRequest.headers.get("authorization")).toBe(
      "Bearer admin-token",
    );
    expect(adminRequest.headers.get("accept-language")).toBe("es");
  });

  it("unwraps success envelopes through the data helper", async () => {
    const fetchImpl = mockFetch({ data: session });

    await expect(
      throwOnOpenApiErrorData(
        authControllerLogin(
          {
            email: "ada@example.com",
            password: "password123",
          },
          { fetchImpl },
        ),
      ),
    ).resolves.toEqual(session);
  });

  it("keeps HTTP errors as typed low-level results until explicitly thrown", async () => {
    const problem = {
      code: "auth.invalid_credentials",
      detail: "Invalid email or password",
      status: 401,
      title: "Unauthorized",
      type: "about:blank",
    } satisfies AuthControllerLoginError;
    const fetchImpl = mockFetch(problem, 401);

    const result = await authControllerLogin(
      { email: "ada@example.com", password: "password123" },
      { fetchImpl },
    );

    expect(result).toMatchObject({ error: problem });
    expect(result.response.status).toBe(401);
    expect("data" in result).toBe(false);
  });

  it("throws ApiClientError with status, typed body, response, and useful message", async () => {
    const problem = {
      detail: "Use a stronger password",
      status: 400,
      title: "Bad Request",
      type: "about:blank",
    } satisfies AuthControllerRegisterError;
    const response = jsonResponse(problem, 400);

    await expect(
      throwOnOpenApiError(
        Promise.resolve({ error: problem, response } as const),
      ),
    ).rejects.toMatchObject({
      body: problem,
      message: "Use a stronger password",
      name: "ApiClientError",
      response,
      status: 400,
    });

    try {
      await throwOnOpenApiError(
        Promise.resolve({ error: problem, response } as const),
      );
      throw new Error("expected throw");
    } catch (error) {
      expect(isApiClientError<AuthControllerRegisterError>(error)).toBe(true);
      if (!isApiClientError<AuthControllerRegisterError>(error)) {
        throw error;
      }
      expect(error).toBeInstanceOf(ApiClientError);
      expect(error.body).toEqual(problem);
      expect(error.response).toBe(response);
    }

    expect(isApiClientError(new Error("plain"))).toBe(false);
  });

  it("serializes mutation bodies for login, register, locale, and preferences updates", async () => {
    const loginBody: LoginDto = {
      email: "ada@example.com",
      password: "password123",
    };
    const loginFetch = mockFetch({ data: session });
    await authControllerLogin(loginBody, { fetchImpl: loginFetch });
    await expect(firstRequest(loginFetch).clone().json()).resolves.toEqual(
      loginBody,
    );

    const registerBody: RegisterDto = {
      displayName: "Ada Lovelace",
      email: "ada@example.com",
      locale: "en",
      password: "password123",
    };
    const registerFetch = mockFetch({ data: session });
    await authControllerRegister(registerBody, { fetchImpl: registerFetch });
    const registerRequest = firstRequest(registerFetch);
    expect(registerRequest.method).toBe("POST");
    expect(registerRequest.headers.get("content-type")).toContain(
      "application/json",
    );
    await expect(registerRequest.clone().json()).resolves.toEqual(registerBody);

    const updateLocaleBody: UpdateLocaleDto = { locale: "es" };
    const updateFetch = mockFetch({ data: session.user });
    await authControllerUpdateLocale(updateLocaleBody, {
      fetchImpl: updateFetch,
    });
    const updateRequest = firstRequest(updateFetch);
    expect(updateRequest.method).toBe("PATCH");
    await expect(updateRequest.clone().json()).resolves.toEqual(
      updateLocaleBody,
    );

    const updatePreferencesBody: UpdatePreferencesDto = {
      locale: "en",
      theme: "dark",
    };
    const updatePreferencesFetch = mockFetch({ data: session.user });
    await authControllerUpdatePreferences(updatePreferencesBody, {
      fetchImpl: updatePreferencesFetch,
    });
    const updatePreferencesRequest = firstRequest(updatePreferencesFetch);
    expect(updatePreferencesRequest.method).toBe("PATCH");
    await expect(updatePreferencesRequest.clone().json()).resolves.toEqual(
      updatePreferencesBody,
    );
  });

  it("exposes stable GET query keys", () => {
    expect(getAuthControllerMeQueryKey()).toEqual(["get", "/auth/me"]);
    expect(getAuthControllerLocalesQueryKey()).toEqual([
      "get",
      "/auth/locales",
    ]);
    expect(getAuthControllerUpdatePreferencesMutationKey()).toEqual([
      "patch",
      "/auth/me/preferences",
    ]);
  });

  it("keeps generated success/error aliases and mutation error variables usable", () => {
    type LoginMutationOptions = NonNullable<
      Parameters<typeof useAuthControllerLoginMutation>[0]
    >;
    type LoginOnError = NonNullable<LoginMutationOptions["onError"]>;
    type RegisterMutationOptions = NonNullable<
      Parameters<typeof useAuthControllerRegisterMutation>[0]
    >;
    type RegisterOnError = NonNullable<RegisterMutationOptions["onError"]>;
    type UpdateLocaleMutationOptions = NonNullable<
      Parameters<typeof useAuthControllerUpdateLocaleMutation>[0]
    >;
    type UpdateLocaleOnError = NonNullable<
      UpdateLocaleMutationOptions["onError"]
    >;
    type UpdatePreferencesMutationOptions = NonNullable<
      Parameters<typeof useAuthControllerUpdatePreferencesMutation>[0]
    >;
    type UpdatePreferencesOnError = NonNullable<
      UpdatePreferencesMutationOptions["onError"]
    >;

    expectTypeOf<AuthControllerLoginData>().toEqualTypeOf<AuthSessionViewDto>();
    expectTypeOf<AuthControllerRegisterData>().toEqualTypeOf<AuthSessionViewDto>();
    expectTypeOf<AuthControllerUpdateLocaleData>().toEqualTypeOf<
      AuthSessionViewDto["user"]
    >();
    expectTypeOf<AuthControllerUpdatePreferencesData>().toEqualTypeOf<
      AuthSessionViewDto["user"]
    >();
    expectTypeOf<Parameters<LoginOnError>[0]>().toEqualTypeOf<
      ApiClientError<AuthControllerLoginError>
    >();
    expectTypeOf<Parameters<LoginOnError>[1]>().toEqualTypeOf<LoginDto>();
    expectTypeOf<Parameters<RegisterOnError>[1]>().toEqualTypeOf<RegisterDto>();
    expectTypeOf<
      Parameters<UpdateLocaleOnError>[1]
    >().toEqualTypeOf<UpdateLocaleDto>();
    expectTypeOf<
      Parameters<UpdatePreferencesOnError>[1]
    >().toEqualTypeOf<UpdatePreferencesDto>();
  });
});
