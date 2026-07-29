import { initializeCapabilities } from './capabilities.bootstrap.generated';

async function bootstrap(): Promise<void> {
  initializeCapabilities('telegram-bot-api');
  const [bootstrapModule, appModule] = await Promise.all([
    import('./bootstrap.runtime'),
    import('./telegram-bot-api.module'),
  ]);
  await bootstrapModule.bootstrapNestApi(appModule.TelegramBotApiModule.register(), {
    appName: 'telegram-bot-api',
    corsOrigins: bootstrapModule.resolveDefaultDevelopmentCorsOrigins(),
    port: 3013,
  });
}

void bootstrap();
