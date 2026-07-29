import { buildStackImages, composeArgs, run, stackIncludes, upStack, urls, waitForText } from './compose';

export default async function globalSetup(): Promise<void> {
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
  ] as const;
  await Promise.all(readinessChecks.filter(([service]) => stackIncludes(service)).map(([, check]) => check()));
}
