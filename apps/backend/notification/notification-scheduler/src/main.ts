import { initializeCapabilities } from './capabilities.bootstrap.generated';

async function bootstrap(): Promise<void> {
  initializeCapabilities('notification-scheduler');
  const [nestModule, appModule] = await Promise.all([
    import('./bootstrap.runtime'),
    import('./notification-scheduler.module'),
  ]);
  const application = await nestModule.NestFactory.createApplicationContext(appModule.NotificationSchedulerModule, {
    logger: ['error', 'warn', 'log'],
  });
  application.enableShutdownHooks();
  nestModule.Logger.log('Application context successfully started', 'Bootstrap');
}

void bootstrap();
