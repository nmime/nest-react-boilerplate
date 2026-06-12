import { expect, test, type Page } from "@playwright/test";
import { composeEnv, urls } from "./compose";

interface HealthCheckResponse {
  name: string;
  status: string;
  details?: { app?: unknown };
}

interface HealthResponse {
  status: string;
  checks?: HealthCheckResponse[];
  error?: unknown;
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

const authPassword = "fullstack-secret";

const successfulAuthStatuses = [200, 201];

const healthyStatuses = ["ok", "degraded"];

function bootstrapAdminEnabledFor(email: string): boolean {
  if (composeEnv.ADMIN_BOOTSTRAP_ENABLED !== "true") {
    return false;
  }

  const normalizedEmail = email.toLowerCase();
  return (composeEnv.ADMIN_BOOTSTRAP_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .includes(normalizedEmail);
}

async function parseSessionResponse(
  response: Response,
  action: string,
): Promise<SessionResponse> {
  expect(
    successfulAuthStatuses,
    `${action} should return a successful session response`,
  ).toContain(response.status);
  return (await response.json()) as SessionResponse;
}

async function login(baseUrl: string, email: string): Promise<SessionResponse> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: authPassword,
    }),
  });

  return parseSessionResponse(response, `login for ${email}`);
}

function assertBootstrapAdminSession(
  session: SessionResponse,
  email: string,
): void {
  if (!bootstrapAdminEnabledFor(email)) {
    return;
  }

  expect(session.data.user.roles).toContain("admin");
  expect(session.data.user.permissions).toContain("admin:profile:read");
}

function assertHealthyApp(
  label: string,
  body: HealthResponse,
  appName: string,
): void {
  expect(healthyStatuses, `${label} health should be ok or degraded`).toContain(
    body.status,
  );
  expect(
    body.error,
    `${label} health should not expose a top-level error`,
  ).toBeUndefined();

  const checks = body.checks ?? [];
  expect(
    checks.filter((check) => check.status === "error"),
    `${label} health should not include failing checks`,
  ).toEqual([]);
  expect(
    checks.find((check) => check.name === "runtime")?.details?.app,
    `${label} health should identify the running app`,
  ).toBe(appName);
}

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
      password: authPassword,
      displayName: "Fullstack User",
    }),
  });

  if (response.status === 409) {
    const session = await login(baseUrl, email);
    assertBootstrapAdminSession(session, email);
    return session;
  }

  const session = await parseSessionResponse(
    response,
    `registration for ${email}`,
  );
  assertBootstrapAdminSession(session, email);
  return session;
}

test("health endpoints and frontends are reachable through the Docker stack", async ({
  page,
}) => {
  const health = await Promise.all([
    fetch(`${urls.authApi}/health`).then(async (response) => ({
      label: "auth api",
      appName: "auth-app-api",
      body: (await response.json()) as HealthResponse,
    })),
    fetch(`${urls.userApi}/health`).then(async (response) => ({
      label: "user api",
      appName: "user-app-api",
      body: (await response.json()) as HealthResponse,
    })),
    fetch(`${urls.adminApi}/health`).then(async (response) => ({
      label: "admin api",
      appName: "backend-admin-app-api",
      body: (await response.json()) as HealthResponse,
    })),
  ]);
  for (const { label, body, appName } of health) {
    assertHealthyApp(label, body, appName);
  }

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
  await page.getByLabel("Login password").fill(authPassword);
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

  await page.context().clearCookies();
  await gotoWithRetry(
    page,
    `${urls.adminApp}/profile?admin_token=${session.data.accessToken}`,
  );
  await expect(page).not.toHaveURL(/admin_token=|token=/u);
  await expect(
    page.getByText(
      /Authenticated principal is missing\.|Request failed with 401\.|Unauthorized|Missing bearer token\./u,
    ),
  ).toBeVisible();
});
