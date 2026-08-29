import { initializeCapabilities } from './capabilities.bootstrap.generated';

export async function bootstrap(): Promise<void> {
  initializeCapabilities('notification-consumer');
  const [bootstrapModule, appModule] = await Promise.all([
    import('./bootstrap.runtime'),
    import('./notification-consumer.module'),
  ]);
  await bootstrapModule.bootstrapNestApi(appModule.NotificationConsumerModule, {
    appName: 'notification-consumer',
    corsOrigins: bootstrapModule.resolveDefaultDevelopmentCorsOrigins(),
    port: 3004,
  });
}

void bootstrap();
