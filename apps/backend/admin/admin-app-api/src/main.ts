import { initializeCapabilities } from './capabilities.bootstrap.generated';

async function bootstrap(): Promise<void> {
  initializeCapabilities('admin-app-api');
  const [bootstrapModule, appModule] = await Promise.all([
    import('./bootstrap.runtime'),
    import('./admin-app-api.module'),
  ]);
  await bootstrapModule.bootstrapNestApi(appModule.AdminAppApiModule, {
    appName: 'admin-app-api',
    corsOrigins: bootstrapModule.resolveDefaultDevelopmentCorsOrigins(),
    openApi: { authSchemes: ['session-cookie'] },
    port: 3001,
  });
}

void bootstrap();
