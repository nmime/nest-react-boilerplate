import { buildStackImages, composeArgs, run, upStack, urls, waitForText } from './compose';

export default async function globalSetup(): Promise<void> {
  await run('docker', [...composeArgs, 'down', '--volumes', '--remove-orphans']);
  if (process.env.FULLSTACK_SKIP_BUILD !== 'true') {
    await buildStackImages();
  }
  await upStack();
  await Promise.all([
    waitForText('auth api', `${urls.authApi}/health`, 'auth-app-api'),
    waitForText('user api', `${urls.userApi}/health`, 'user-app-api'),
    waitForText('admin api', `${urls.adminApi}/health`, 'admin-app-api'),
    waitForText('user app', `${urls.userApp}/`, 'User App'),
    waitForText('admin app', `${urls.adminApp}/`, 'Admin App'),
    waitForText('landing app', `${urls.landingApp}/`, 'Nest React Boilerplate'),
  ]);
}
