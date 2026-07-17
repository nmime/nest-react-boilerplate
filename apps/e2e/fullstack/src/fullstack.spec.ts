import { expect, test, type Page } from '@playwright/test';
import { sign } from '@tma.js/init-data-node';
import { composeEnv, urls } from './compose';

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
    user: { email: string | null; roles: string[]; permissions: string[] };
  };
}

interface BetterAuthSessionResponse {
  session: { token: string };
  user: { email: string; name: string };
}

interface ExternalAuthSessionResponse {
  data: {
    session: SessionResponse['data'];
  };
}

const authorizationScheme = 'Bearer';

const bearerAuthorization = (token: string): string => [authorizationScheme, token].join(' ');

const authPassword = 'fullstack-secret';

const successfulAuthStatuses = [200, 201];

const healthyStatuses = ['ok', 'degraded'];

function bootstrapAdminEnabledFor(email: string): boolean {
  if (composeEnv.ADMIN_BOOTSTRAP_ENABLED !== 'true') {
    return false;
  }

  const normalizedEmail = email.toLowerCase();
  return composeEnv.ADMIN_BOOTSTRAP_EMAILS.split(',')
    .map((item) => item.trim().toLowerCase())
    .includes(normalizedEmail);
}

async function parseSessionResponse(response: Response, action: string): Promise<SessionResponse> {
  expect(successfulAuthStatuses, `${action} should return a successful session response`).toContain(response.status);
  return (await response.json()) as SessionResponse;
}

async function login(baseUrl: string, email: string): Promise<SessionResponse> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password: authPassword,
    }),
  });

  return parseSessionResponse(response, `login for ${email}`);
}

function assertBootstrapAdminSession(session: SessionResponse, email: string): void {
  if (!bootstrapAdminEnabledFor(email)) {
    return;
  }

  expect(session.data.user.roles).toContain('admin');
  expect(session.data.user.permissions).toContain('admin:profile:read');
}

function assertHealthyApp(label: string, body: HealthResponse, appName: string): void {
  expect(healthyStatuses, `${label} health should be ok or degraded`).toContain(body.status);
  expect(body.error, `${label} health should not expose a top-level error`).toBeUndefined();

  const checks = body.checks ?? [];
  expect(
    checks.filter((check) => check.status === 'error'),
    `${label} health should not include failing checks`,
  ).toEqual([]);
  expect(
    checks.find((check) => check.name === 'runtime')?.details?.app,
    `${label} health should identify the running app`,
  ).toBe(appName);
}

async function gotoWithRetry(page: Page, url: string): Promise<void> {
  const started = Date.now();
  let lastError: unknown;

  while (Date.now() - started < 30_000) {
    try {
      // eslint-disable-next-line no-await-in-loop -- navigation retries are sequential by design
      await page.goto(url);
      return;
    } catch (error) {
      lastError = error;
      // eslint-disable-next-line no-await-in-loop -- navigation retries are sequential by design
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function register(baseUrl: string, email: string): Promise<SessionResponse> {
  const response = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password: authPassword,
      displayName: 'Fullstack User',
    }),
  });

  if (response.status === 409) {
    const session = await login(baseUrl, email);
    assertBootstrapAdminSession(session, email);
    return session;
  }

  const session = await parseSessionResponse(response, `registration for ${email}`);
  assertBootstrapAdminSession(session, email);
  return session;
}

test('health endpoints and frontends are reachable through the Docker stack', async ({ page }) => {
  const health = await Promise.all([
    fetch(`${urls.authApi}/health`).then(async (response) => ({
      label: 'auth api',
      appName: 'auth-app-api',
      body: (await response.json()) as HealthResponse,
    })),
    fetch(`${urls.userApi}/health`).then(async (response) => ({
      label: 'user api',
      appName: 'user-app-api',
      body: (await response.json()) as HealthResponse,
    })),
    fetch(`${urls.adminApi}/health`).then(async (response) => ({
      label: 'admin api',
      appName: 'admin-app-api',
      body: (await response.json()) as HealthResponse,
    })),
  ]);
  for (const { label, body, appName } of health) {
    assertHealthyApp(label, body, appName);
  }

  await gotoWithRetry(page, urls.landingApp);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'A focused foundation for your next product.',
    }),
  ).toBeVisible();
  await gotoWithRetry(page, urls.userApp);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'A clear place to manage your account.',
    }),
  ).toBeVisible();
  await gotoWithRetry(page, urls.adminApp);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Operate the product platform with a fail-closed admin experience.',
    }),
  ).toBeVisible();
});

test('registered users can log in through the user frontend same-origin proxies', async ({ page }) => {
  const email = `fullstack-${Date.now()}@example.com`;
  const session = await register(urls.userApp, email);

  const profile = await fetch(`${urls.userApp}/profile/me`, {
    headers: { Authorization: bearerAuthorization(session.data.accessToken) },
  });
  expect(profile.status).toBe(200);
  expect(await profile.text()).toContain(email);

  await gotoWithRetry(page, `${urls.userApp}/auth`);
  await page.getByLabel('Login email').fill(email);
  await page.getByLabel('Login password').fill(authPassword);
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByText(`Ready: ${email}`)).toBeVisible();
  await expect(page).not.toHaveURL(/token=/u);
});

test('Telegram TMA establishes Better Auth and application sessions through the same-origin proxy', async ({
  request,
}) => {
  const telegramUserId = 9_000_000 + (Date.now() % 999_999);
  const initData = sign(
    {
      query_id: `fullstack-${telegramUserId}`,
      start_param: 'fullstack-e2e',
      user: {
        allows_write_to_pm: true,
        first_name: 'Fullstack',
        id: telegramUserId,
        language_code: 'en',
        last_name: 'Telegram',
        username: `fullstack_${telegramUserId}`,
      },
    },
    composeEnv.TELEGRAM_BOT_TOKEN,
    new Date(),
  );

  const betterAuthBypassResponse = await request.post(`${urls.userApp}/auth/telegram/tma`, {
    data: { initData },
  });
  expect(betterAuthBypassResponse.status()).toBe(401);

  const tamperedResponse = await request.post(`${urls.userApp}/api/auth/telegram/tma`, {
    data: { initData: initData.replace('Fullstack', 'Mallory') },
  });
  expect(tamperedResponse.status()).toBe(401);

  const betterAuthResponse = await request.post(`${urls.userApp}/api/auth/telegram/tma`, {
    data: { initData },
  });
  expect(betterAuthResponse.status()).toBe(200);
  await expect(betterAuthResponse.json()).resolves.toMatchObject({
    identity: {
      channel: 'telegram_tma',
      provider: 'telegram',
      providerSubject: String(telegramUserId),
    },
    status: 'authenticated',
  });

  const betterAuthSessionResponse = await request.get(`${urls.userApp}/api/auth/get-session`);
  expect(betterAuthSessionResponse.status()).toBe(200);
  const betterAuthSession = (await betterAuthSessionResponse.json()) as BetterAuthSessionResponse;
  expect(betterAuthSession).toMatchObject({
    user: {
      email: `telegram-${telegramUserId}@telegram.invalid`,
      name: 'Fullstack Telegram',
    },
  });
  expect(betterAuthSession.session.token).toBeTruthy();

  const applicationAuthResponse = await request.post(`${urls.userApp}/auth/telegram/tma`, {
    data: { initData },
  });
  expect(successfulAuthStatuses).toContain(applicationAuthResponse.status());
  const applicationAuth = (await applicationAuthResponse.json()) as ExternalAuthSessionResponse;
  expect(applicationAuth.data.session.user.email).toBeNull();
  expect(applicationAuth.data.session.accessToken).toBeTruthy();

  const identitiesResponse = await request.get(`${urls.userApp}/auth/provider-identities`, {
    headers: { Authorization: bearerAuthorization(applicationAuth.data.session.accessToken) },
  });
  expect(identitiesResponse.status()).toBe(200);
  await expect(identitiesResponse.json()).resolves.toMatchObject({
    data: {
      items: [
        {
          channel: 'telegram_tma',
          provider: 'telegram',
          providerSubject: String(telegramUserId),
        },
      ],
    },
  });
});

test('admin API accepts bearer tokens while production admin frontend ignores URL tokens', async ({ page }) => {
  const session = await register(urls.userApp, 'admin@example.com');
  expect(session.data.user.roles).toContain('admin');
  expect(session.data.user.permissions).toContain('admin:profile:read');

  const adminProfile = await fetch(`${urls.adminApp}/admin/profile/me`, {
    headers: { Authorization: bearerAuthorization(session.data.accessToken) },
  });
  expect(adminProfile.status).toBe(200);
  expect(await adminProfile.text()).toContain('admin@example.com');

  await page.context().clearCookies();
  await gotoWithRetry(page, `${urls.adminApp}/profile?admin_token=${session.data.accessToken}`);
  await expect(page).not.toHaveURL(/admin_token=|token=/u);
  await expect(page.getByRole('region', { name: 'Access denied' })).toBeVisible();
});
