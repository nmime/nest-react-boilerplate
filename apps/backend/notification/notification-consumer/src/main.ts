import { NestFactory } from '@nestjs/core';
import { NotificationConsumerModule } from './notification-consumer.module';

async function bootstrap(): Promise<void> {
  const application = await NestFactory.createApplicationContext(NotificationConsumerModule, {
    logger: ['error', 'warn', 'log'],
  });
  application.enableShutdownHooks();
}

void bootstrap();
