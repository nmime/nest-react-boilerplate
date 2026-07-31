// @requirements REQ-FRONTEND-JOURNEY-001
// Evidence for: REQ-AUTH-FRONTEND-009 REQ-AUTH-IDENTITY-005 REQ-AUTH-SESSION-002 REQ-FRONTEND-ACCESSIBILITY-003 REQ-FRONTEND-ERROR-005 REQ-FRONTEND-JOURNEY-001 REQ-FRONTEND-SHELL-004 REQ-FRONTEND-SSR-007 REQ-NOTIFY-PREFERENCE-006
import { randomUUID } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';
// Runtime journey evidence for REQ-AUTH-SESSION-002 and
// REQ-FRONTEND-JOURNEY-001.
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
    user: { email: string | null; roles: string[]; permissions: string[] };
  };
}

interface BetterAuthSessionResponse {
  session: Record<string, unknown>;
  user: { email: string; name: string };
}

interface ExternalAuthSessionResponse {
  data: {
    session: SessionResponse['data'];
  };
}

interface AdminUsersResponse {
  data: {
    items: Array<{ email: string; id: string; permissions: string[]; roles: string[] }>;
  };
}

interface AdminAuditResponse {
  data: {
    items: Array<{ action: string; resource: string; targetId?: string }>;
  };
}

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

async function expectPageQuality(page: Page, label: string): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 }), `${label} should have one page heading`).toHaveCount(1);
  await expect(page.locator('main'), `${label} should have one main landmark`).toHaveCount(1);

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(horizontalOverflow, `${label} should not overflow the viewport horizontally`).toBeLessThanOrEqual(1);
}

async function focusWithKeyboard(page: Page, target: Locator, label: string): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });

  /* eslint-disable no-await-in-loop -- keyboard focus order and its presentation must be inspected sequentially */
  for (let index = 0; index < 30; index += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) {
      await expect(target, `${label} should remain visible when keyboard-focused`).toBeVisible();
      const focusPresentation = await target.evaluate((element) => ({
        boxShadow: getComputedStyle(element).boxShadow,
        focusVisible: element.matches(':focus-visible'),
      }));
      expect(focusPresentation.focusVisible, `${label} should match :focus-visible`).toBe(true);
      expect(focusPresentation.boxShadow, `${label} should render a visible focus indicator`).not.toBe('none');
      return;
    }
  }
  /* eslint-enable no-await-in-loop */

  throw new Error(`${label} was not reachable through the keyboard focus order.`);
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

test('@critical @api-critical registration and login preserve the durable API session', async ({ request }) => {
  const email = `fullstack-api-${randomUUID()}@example.com`;
  const registration = await request.post(`${urls.authApi}/auth/register`, {
    data: { displayName: 'Fullstack API User', email, password: authPassword },
  });
  expect(successfulAuthStatuses).toContain(registration.status());

  const loginResponse = await request.post(`${urls.authApi}/auth/login`, {
    data: { email, password: authPassword },
  });
  expect(successfulAuthStatuses).toContain(loginResponse.status());

  const sessionResponse = await request.get(`${urls.authApi}/auth/me`);
  expect(sessionResponse.status()).toBe(200);
  await expect(sessionResponse.json()).resolves.toMatchObject({ data: { user: { email } } });
});

test('API and SSR readiness endpoints identify the Docker services', async () => {
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

  const siteReady = await fetch(`${urls.siteApp}/ready`);
  expect(siteReady.status).toBe(200);
  await expect(siteReady.json()).resolves.toEqual({ runtime: 'node', service: 'site-app', status: 'ok' });
});

test('landing journey exposes public destinations at the 320px viewport floor', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await gotoWithRetry(page, urls.landingApp);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'A focused foundation for your next product.',
    }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Public presence' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Customer account' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Admin workspace' })).toBeVisible();
  await expectPageQuality(page, 'landing app');

  const userAppLink = page.getByRole('link', { name: 'Preview user app' });
  await expect(userAppLink).toHaveAttribute('href', urls.userApp);
  await focusWithKeyboard(page, userAppLink, 'landing user-app link');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`${urls.userApp}/`);
  await expect(page.getByRole('heading', { level: 1, name: 'A clear place to manage your account.' })).toBeVisible();

  await gotoWithRetry(page, urls.landingApp);
  const adminAppLink = page.getByRole('link', { name: 'Preview admin app' });
  await expect(adminAppLink).toHaveAttribute('href', urls.adminApp);
  await focusWithKeyboard(page, adminAppLink, 'landing admin-app link');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`${urls.adminApp}/`);
  await expect(page.getByRole('heading', { name: 'Authentication required' })).toBeVisible();
});

test('site sends meaningful SSR HTML and hydrates client-side navigation without replacing the document', async ({
  page,
  request,
}) => {
  const serverResponse = await request.get(urls.siteApp);
  expect(serverResponse.status()).toBe(200);
  expect(serverResponse.headers()['content-type']).toContain('text/html');
  const serverHtml = await serverResponse.text();
  expect(serverHtml).toContain('A dependable home for the pages people return to.');
  expect(serverHtml).toMatch(/<script\b/iu);

  const hydrationErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydration|did not match|server html/iu.test(message.text())) {
      hydrationErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    if (/hydration|did not match|server html/iu.test(error.message)) {
      hydrationErrors.push(error.message);
    }
  });

  await page.setViewportSize({ width: 320, height: 720 });
  await gotoWithRetry(page, `${urls.siteApp}/problems`);
  await expect(page.getByRole('heading', { level: 1, name: 'API problem types' })).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.dataset['hydrationNavigationProof'] = 'preserved';
  });
  await page.getByRole('link', { name: 'Nest React Boilerplate' }).click();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'A dependable home for the pages people return to.',
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(`${urls.siteApp}/`);
  expect(
    await page.evaluate(() => document.documentElement.dataset['hydrationNavigationProof']),
    'hydrated navigation should preserve the current document',
  ).toBe('preserved');
  expect(hydrationErrors).toEqual([]);
  await expectPageQuality(page, 'site app');
});

test('user frontend renders a safe authentication failure without leaking credential diagnostics', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await gotoWithRetry(page, `${urls.userApp}/auth`);
  await expect(page.getByText('Sign in or register to continue.')).toBeVisible();

  await page.getByLabel('Login email').fill(`missing-${Date.now()}@example.com`);
  await page.getByLabel('Login password').fill('incorrect-password');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page.getByText('Forbidden: Authentication is required.')).toBeVisible();
  await expect(page.getByText('Invalid email or password.')).toHaveCount(0);
  await expectPageQuality(page, 'user authentication failure');
});

test('@critical user login honors safe return navigation, survives reload, and logout revokes the session', async ({
  page,
}) => {
  const email = `fullstack-${Date.now()}@example.com`;
  await register(urls.userApp, email);

  await page.setViewportSize({ width: 375, height: 812 });
  await gotoWithRetry(page, `${urls.userApp}/auth?returnUrl=/profile`);
  await expect(page.getByText('Sign in or register to continue.')).toBeVisible();
  await page.getByLabel('Login email').fill(email);
  await page.getByLabel('Login password').fill(authPassword);
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page).toHaveURL(`${urls.userApp}/profile`);
  await expect(page.getByText(`Ready: ${email}`)).toBeVisible();
  await expect(page).not.toHaveURL(/token=/u);
  await page.reload();
  await expect(page.getByText(`Ready: ${email}`)).toBeVisible();

  await page.getByRole('link', { name: 'Settings' }).first().click();
  await expect(page).toHaveURL(`${urls.userApp}/settings`);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expectPageQuality(page, 'authenticated user settings');

  const languageSwitcher = page.getByRole('combobox', { name: 'Language' });
  await languageSwitcher.click();
  await page.getByRole('option', { name: 'Russian' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect
    .poll(async () => {
      const response = await page.context().request.get(`${urls.authApi}/auth/me`);
      const body = (await response.json()) as { data?: { user?: { locale?: string } } };
      return { locale: body.data?.user?.locale, status: response.status() };
    })
    .toEqual({ locale: 'ru', status: 200 });

  const themeSwitcher = page.getByRole('combobox', { name: 'Тема' });
  await themeSwitcher.click();
  await page.getByRole('option', { name: 'Тёмная' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect
    .poll(async () => {
      const response = await page.context().request.get(`${urls.authApi}/auth/me`);
      const body = (await response.json()) as { data?: { user?: { locale?: string; theme?: string } } };
      return { locale: body.data?.user?.locale, status: response.status(), theme: body.data?.user?.theme };
    })
    .toEqual({ locale: 'ru', status: 200, theme: 'dark' });

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('combobox', { name: 'Язык' })).toContainText('Русский');
  await expect(page.getByRole('combobox', { name: 'Тема' })).toContainText('Тёмная');

  await page.getByRole('button', { name: 'Выйти' }).click();
  await expect(page).toHaveURL(`${urls.userApp}/auth`);
  await expect(page.getByText('Войдите или зарегистрируйтесь, чтобы продолжить.')).toBeVisible();
  const revokedSession = await page.context().request.get(`${urls.authApi}/auth/me`);
  expect(revokedSession.status()).toBe(401);
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
  expect(betterAuthSession.session).not.toHaveProperty('token');
  expect(betterAuthSession.session).not.toHaveProperty('accessToken');
  expect(betterAuthSession.session).not.toHaveProperty('refreshToken');
  expect(betterAuthSession.session).not.toHaveProperty('idToken');

  const applicationAuthResponse = await request.post(`${urls.userApp}/auth/telegram/tma`, {
    data: { initData },
  });
  expect(successfulAuthStatuses).toContain(applicationAuthResponse.status());
  const applicationAuth = (await applicationAuthResponse.json()) as ExternalAuthSessionResponse;
  expect(applicationAuth.data.session.user.email).toBeNull();
  expect(applicationAuth.data.session).not.toHaveProperty('accessToken');

  const identitiesResponse = await request.get(`${urls.userApp}/auth/provider-identities`);
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

test('admin API accepts only its cookie session and ignores browser URL tokens', async ({ page }) => {
  const targetEmail = `role-target-${Date.now()}@example.com`;
  await register(urls.userApp, targetEmail);
  const session = await register(urls.userApp, 'admin@example.com');
  expect(session.data.user.roles).toContain('admin');
  expect(session.data.user.permissions).toContain('admin:profile:read');

  const bearerProfile = await fetch(`${urls.adminApi}/admin/profile/me`, {
    headers: { Authorization: 'Bearer header.payload.signature' },
  });
  expect(bearerProfile.status).toBe(401);

  const loginResponse = await page.context().request.post(`${urls.authApi}/auth/login`, {
    data: { email: 'admin@example.com', password: authPassword },
  });
  expect(successfulAuthStatuses).toContain(loginResponse.status());
  const adminProfile = await page.context().request.get(`${urls.adminApi}/admin/profile/me`);
  expect(adminProfile.status()).toBe(200);
  expect(await adminProfile.text()).toContain('admin@example.com');

  await gotoWithRetry(page, `${urls.adminApp}/admin`);
  await expect(page.getByRole('heading', { level: 1, name: 'Admin dashboard' })).toBeVisible();
  const openNavigation = page.getByRole('button', { name: 'Open navigation' });
  if (await openNavigation.isVisible()) {
    await openNavigation.click();
  }
  await page.getByRole('button', { name: 'Users' }).click();
  await page.getByRole('link', { name: 'Roles' }).click();
  await expect(page).toHaveURL(`${urls.adminApp}/admin/roles`);
  await expect(page.getByRole('heading', { level: 1, name: 'Roles and permissions' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Admin dashboard' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Admin dashboard' })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 720 });
  await expectPageQuality(page, 'authenticated admin dashboard');

  const rolesNavigation = await page.context().request.get(`${urls.adminApp}/admin/roles`, {
    headers: { Accept: 'text/html' },
  });
  expect(rolesNavigation.status()).toBe(200);
  expect(rolesNavigation.headers()['content-type']).toContain('text/html');
  expect(rolesNavigation.headers().vary).toContain('Accept');

  const sameOriginRoles = await page.context().request.get(`${urls.adminApp}/admin/roles`, {
    headers: { Accept: 'application/json' },
  });
  expect(sameOriginRoles.status()).toBe(200);
  expect(sameOriginRoles.headers()['content-type']).toContain('application/json');
  await expect(sameOriginRoles.json()).resolves.toMatchObject({
    data: { roles: expect.any(Array), permissions: expect.any(Array) },
  });

  const usersResponse = await page.context().request.get(`${urls.adminApi}/admin/users?search=${targetEmail}`);
  expect(usersResponse.status()).toBe(200);
  const users = (await usersResponse.json()) as AdminUsersResponse;
  const targetUser = users.data.items.find((user) => user.email === targetEmail);
  expect(targetUser).toBeDefined();
  if (!targetUser) {
    throw new Error(`Admin users response did not include ${targetEmail}.`);
  }

  const roleKey = `operations.${Date.now()}`;
  const createRoleResponse = await page.context().request.post(`${urls.adminApi}/admin/roles`, {
    data: {
      key: roleKey,
      label: 'Fullstack operations',
      permissions: ['admin:dashboard:read'],
    },
  });
  expect(successfulAuthStatuses).toContain(createRoleResponse.status());

  const assignRoleResponse = await page
    .context()
    .request.put(`${urls.adminApi}/admin/users/${targetUser.id}/roles`, { data: { roles: ['user', roleKey] } });
  expect(assignRoleResponse.status()).toBe(200);
  await expect(assignRoleResponse.json()).resolves.toMatchObject({
    data: { roles: ['user', roleKey] },
  });

  const persistedUserResponse = await page.context().request.get(`${urls.adminApi}/admin/users/${targetUser.id}`);
  expect(persistedUserResponse.status()).toBe(200);
  await expect(persistedUserResponse.json()).resolves.toMatchObject({
    data: { email: targetEmail, roles: ['user', roleKey] },
  });

  const featureFlagResponse = await page
    .context()
    .request.put(`${urls.adminApi}/admin/feature-flags/fullstack.roleassignment`, {
      data: { description: 'Fullstack admin proof', enabled: true, value: true },
    });
  expect(featureFlagResponse.status()).toBe(200);
  await expect(featureFlagResponse.json()).resolves.toMatchObject({
    data: { key: 'fullstack.roleassignment', value: true },
  });

  const roleAuditResponse = await page
    .context()
    .request.get(`${urls.adminApi}/admin/audit?action=admin.user.roles.update&targetId=${targetUser.id}`);
  expect(roleAuditResponse.status()).toBe(200);
  const roleAudit = (await roleAuditResponse.json()) as AdminAuditResponse;
  expect(roleAudit.data.items).toContainEqual(
    expect.objectContaining({
      action: 'admin.user.roles.update',
      resource: 'admin.users',
      targetId: targetUser.id,
    }),
  );

  await page.context().clearCookies();
  await gotoWithRetry(page, `${urls.adminApp}/profile?admin_token=ignored`);
  await expect(page).not.toHaveURL(/admin_token=|token=/u);
  await expect(page.getByRole('heading', { level: 1, name: 'Access denied' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Access denied' })).toBeVisible();
  await expectPageQuality(page, 'admin access denial');
});
