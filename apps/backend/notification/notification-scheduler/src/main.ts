import { NestFactory } from '@nestjs/core';
import { NotificationSchedulerModule } from './notification-scheduler.module';

async function bootstrap(): Promise<void> {
  const application = await NestFactory.createApplicationContext(NotificationSchedulerModule, {
    logger: ['error', 'warn', 'log'],
  });
  application.enableShutdownHooks();
}

void bootstrap();
