import { initializeCapabilities } from './capabilities.bootstrap.generated';

async function bootstrap(): Promise<void> {
  initializeCapabilities('user-app-api');
  const [bootstrapModule, appModule] = await Promise.all([
    import('./bootstrap.runtime'),
    import('./user-app-api.module'),
  ]);
  await bootstrapModule.bootstrapNestApi(appModule.UserAppApiModule, {
    appName: 'user-app-api',
    corsOrigins: bootstrapModule.resolveDefaultDevelopmentCorsOrigins(),
    openApi: { authSchemes: ['session-cookie'] },
    port: 3002,
  });
}

void bootstrap();
