import { NestFactory } from '@nestjs/core';
import { resolveDefaultDevelopmentCorsOrigins } from '@app/backend-common-bootstrap';
import { TelegramBotApiModule } from './telegram-bot-api.module';

async function bootstrap(): Promise<void> {
  const config = TelegramBotApiModule.register();
  const app = await NestFactory.create(config);

  app.enableCors({
    origin: resolveDefaultDevelopmentCorsOrigins(),
  });

  await app.listen(3013);
}

void bootstrap();
