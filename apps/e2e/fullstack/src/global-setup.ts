import {
  buildStackImages,
  composeArgs,
  fullstackSelection,
  run,
  stackIncludes,
  upStack,
  urls,
  waitForText,
} from './compose';

export default async function globalSetup(): Promise<void> {
  if (!fullstackSelection) {
    throw new Error(
      'Managed fullstack setup requires a fresh selected closure; use the extended config for external URLs.',
    );
  }
  await run('docker', [...composeArgs, 'down', '--volumes', '--remove-orphans']);
  if (process.env.FULLSTACK_SKIP_BUILD !== 'true') {
    await buildStackImages();
  }
  await upStack();
  const readinessChecks = [
    ['auth-app-api', () => waitForText('auth api', `${urls.authApi}/health`, 'auth-app-api')],
    ['user-app-api', () => waitForText('user api', `${urls.userApi}/health`, 'user-app-api')],
    ['admin-app-api', () => waitForText('admin api', `${urls.adminApi}/health`, 'admin-app-api')],
    ['user-app', () => waitForText('user app', `${urls.userApp}/`, 'User App')],
    ['admin-app', () => waitForText('admin app', `${urls.adminApp}/`, 'Admin App')],
    ['landing-app', () => waitForText('landing app', `${urls.landingApp}/`, 'Nest React Boilerplate')],
    ['site-app', () => waitForText('site app', `${urls.siteApp}/ready`, 'site-app')],
  ] as const;
  await Promise.all(readinessChecks.filter(([service]) => stackIncludes(service)).map(([, check]) => check()));
}
