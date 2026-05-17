import { describe, expect, it, vi } from "vitest";
import {
  createAuthSession,
  createFrontendQueryClient,
  fetchAdminProfile,
  fetchAuthMe,
  fetchUserProfile,
  getAdminApiBaseUrl,
  persistAuthLocale,
} from "./api-client";

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: ok ? status : status || 500,
  });

const createFetchMock = () =>
  vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

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

describe("frontend api client", () => {
  it("configures a no-retry query client", () => {
    const client = createFrontendQueryClient();
    expect(client.getDefaultOptions().queries?.retry).toBe(false);
    expect(client.getDefaultOptions().mutations?.retry).toBe(false);
  });

  it("fetches auth, user, and admin payloads with bearer headers", async () => {
    const fetchImpl = createFetchMock()
      .mockResolvedValueOnce(
        jsonResponse({ data: { principal: { subject: "1" } } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ data: { principal: { subject: "2" } } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ data: { principal: { subject: "3" } } }),
      );

    await expect(fetchAuthMe("abc", "en", "", fetchImpl)).resolves.toEqual({
      principal: { subject: "1" },
    });
    await expect(
      fetchUserProfile("abc", "es", "/user", fetchImpl),
    ).resolves.toEqual({
      principal: { subject: "2" },
    });
    await expect(
      fetchAdminProfile("abc", "es", "/admin", fetchImpl),
    ).resolves.toEqual({
      principal: { subject: "3" },
    });

    const authRequest = getRequestAt(fetchImpl, 0);
    const userRequest = getRequestAt(fetchImpl, 1);
    const adminRequest = getRequestAt(fetchImpl, 2);
    expect(authRequest.input).toBe("/auth/me");
    expect(authRequest.init.body).toBeUndefined();
    expect(userRequest.input).toBe("/user/profile/me");
    expect(userRequest.init.body).toBeUndefined();
    expect(adminRequest.input).toBe("/admin/admin/profile/me");
    expect(adminRequest.init.body).toBeUndefined();
    expect(userRequest.headers.get("Accept-Language")).toBe("es");
    expect(userRequest.headers.get("Authorization")).toBe("Bearer abc");
  });

  it("formats auth failures and persists locale payloads", async () => {
    const fetchImpl = createFetchMock()
      .mockResolvedValueOnce(jsonResponse({}, false, 409))
      .mockResolvedValueOnce(
        jsonResponse({ data: { user: { locale: "es" } } }),
      );

    await expect(
      createAuthSession(
        "register",
        {
          displayName: "User",
          email: "new@example.com",
          locale: "es",
          password: "password123",
        },
        "/auth",
        fetchImpl,
      ),
    ).rejects.toThrow("register failed with 409.");

    await expect(
      persistAuthLocale("abc", "es", getAdminApiBaseUrl(), fetchImpl),
    ).resolves.toEqual({ user: { locale: "es" } });
  });
});
