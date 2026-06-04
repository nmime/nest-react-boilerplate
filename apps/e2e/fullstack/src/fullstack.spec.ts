import { expect, test, type Page } from "@playwright/test";
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

const authorizationScheme = "Bearer";

const bearerAuthorization = (token: string): string =>
  [authorizationScheme, token].join(" ");

async function gotoWithRetry(page: Page, url: string): Promise<void> {
  const started = Date.now();
  let lastError: unknown;

  while (Date.now() - started < 30_000) {
    try {
      await page.goto(url);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
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

  await gotoWithRetry(page, urls.landingApp);
  await expect(
    page.getByText("Launch a full-stack Nest and React product foundation."),
  ).toBeVisible();
  await gotoWithRetry(page, urls.userApp);
  await expect(
    page.getByText("Sign in, register, and load your protected profile."),
  ).toBeVisible();
  await gotoWithRetry(page, urls.adminApp);
  await expect(
    page.getByText(
      "Operate the product platform with a fail-closed admin experience.",
    ),
  ).toBeVisible();
});

test("registered users can log in through the user frontend same-origin proxies", async ({
  page,
}) => {
  const email = `fullstack-${Date.now()}@example.com`;
  const session = await register(urls.userApp, email);

  const profile = await fetch(`${urls.userApp}/profile/me`, {
    headers: { Authorization: bearerAuthorization(session.data.accessToken) },
  });
  expect(profile.status).toBe(200);
  expect(await profile.text()).toContain(email);

  await gotoWithRetry(page, urls.userApp);
  await page.getByLabel("Login email").fill(email);
  await page.getByLabel("Login password").fill("fullstack-secret");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByText(`Ready: ${email}`)).toBeVisible();
  await expect(page).not.toHaveURL(/token=/u);
});

test("admin API accepts bearer tokens while production admin frontend ignores URL tokens", async ({
  page,
}) => {
  const session = await register(urls.userApp, "admin@example.com");
  expect(session.data.user.roles).toContain("admin");
  expect(session.data.user.permissions).toContain("admin:profile:read");

  const adminProfile = await fetch(`${urls.adminApp}/admin/profile/me`, {
    headers: { Authorization: bearerAuthorization(session.data.accessToken) },
  });
  expect(adminProfile.status).toBe(200);
  expect(await adminProfile.text()).toContain("admin@example.com");

  await gotoWithRetry(
    page,
    `${urls.adminApp}/profile?admin_token=${session.data.accessToken}`,
  );
  await expect(page).not.toHaveURL(/admin_token=|token=/u);
  await expect(
    page.getByText(
      /Authenticated principal is missing\.|Request failed with 401\.|Unauthorized/u,
    ),
  ).toBeVisible();
});
