import { expect, test } from "@playwright/test";
import { urls } from "./compose";

interface HealthResponse {
  data: { status: string };
}

interface SessionResponse {
  data: {
    accessToken: string;
    user: { email: string; roles: string[]; permissions: string[] };
  };
}

async function register(
  baseUrl: string,
  email: string,
): Promise<SessionResponse> {
  const response = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "fullstack-secret",
      displayName: "Fullstack User",
    }),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as SessionResponse;
}

test("health endpoints and frontends are reachable through the Docker stack", async ({
  page,
}) => {
  const health = await Promise.all([
    fetch(`${urls.authApi}/health`).then(
      async (response) => (await response.json()) as HealthResponse,
    ),
    fetch(`${urls.userApi}/health`).then(
      async (response) => (await response.json()) as HealthResponse,
    ),
    fetch(`${urls.adminApi}/health`).then(
      async (response) => (await response.json()) as HealthResponse,
    ),
  ]);
  expect(health.map((body) => body.data.status)).toEqual(["ok", "ok", "ok"]);

  await page.goto(urls.landingApp);
  await expect(
    page.getByText("Launch a full-stack Nest and React product foundation."),
  ).toBeVisible();
  await page.goto(urls.userApp);
  await expect(
    page.getByText("Sign in, register, and load your protected profile."),
  ).toBeVisible();
  await page.goto(urls.adminApp);
  await expect(
    page.getByText(
      "Operate the product platform with a fail-closed admin experience.",
    ),
  ).toBeVisible();
});

test("auth registration token works through user frontend same-origin proxies", async ({
  page,
}) => {
  const email = `fullstack-${Date.now()}@example.com`;
  const session = await register(urls.userApp, email);

  const profile = await fetch(`${urls.userApp}/profile/me`, {
    headers: { Authorization: `Bearer ${session.data.accessToken}` },
  });
  expect(profile.status).toBe(200);
  expect(await profile.text()).toContain(email);

  await page.goto(`${urls.userApp}/?token=${session.data.accessToken}`);
  await expect(page.getByText(`Ready: ${email}`)).toBeVisible();
});

test("admin bootstrap token is accepted by admin API and admin frontend", async ({
  page,
}) => {
  const session = await register(urls.userApp, "admin@example.com");
  expect(session.data.user.roles).toContain("admin");
  expect(session.data.user.permissions).toContain("admin:profile:read");

  const adminProfile = await fetch(`${urls.adminApp}/admin/profile/me`, {
    headers: { Authorization: `Bearer ${session.data.accessToken}` },
  });
  expect(adminProfile.status).toBe(200);
  expect(await adminProfile.text()).toContain("admin@example.com");

  await page.goto(
    `${urls.adminApp}/profile?admin_token=${session.data.accessToken}`,
  );
  await expect(page.getByText("admin@example.com")).toBeVisible();
});
