import { initializeCapabilities } from './capabilities.bootstrap.generated';

async function bootstrap(): Promise<void> {
  initializeCapabilities('auth-app-api');
  const [bootstrapModule, appModule] = await Promise.all([
    import('./bootstrap.runtime'),
    import('./auth-app-api.module'),
  ]);
  await bootstrapModule.bootstrapNestApi(appModule.AuthAppApiModule, {
    appName: 'auth-app-api',
    corsOrigins: bootstrapModule.resolveDefaultDevelopmentCorsOrigins(),
    openApi: { authSchemes: ['session-cookie'] },
    port: 3003,
  });
}

void bootstrap();
