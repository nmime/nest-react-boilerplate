import { initializeCapabilities } from './capabilities.bootstrap.generated';

export async function bootstrap(): Promise<void> {
  initializeCapabilities('notification-scheduler');
  const [bootstrapModule, appModule] = await Promise.all([
    import('./bootstrap.runtime'),
    import('./notification-scheduler.module'),
  ]);
  await bootstrapModule.bootstrapNestApi(appModule.NotificationSchedulerModule, {
    appName: 'notification-scheduler',
    corsOrigins: bootstrapModule.resolveDefaultDevelopmentCorsOrigins(),
    port: 3005,
  });
}

void bootstrap();
