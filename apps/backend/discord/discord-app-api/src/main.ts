import { initializeCapabilities } from './capabilities.bootstrap.generated';

async function bootstrap(): Promise<void> {
  initializeCapabilities('discord-app-api');
  const [bootstrapModule, appModule] = await Promise.all([
    import('./bootstrap.runtime'),
    import('./discord-app-api.module'),
  ]);
  await bootstrapModule.bootstrapNestApi(appModule.DiscordAppApiModule, {
    appName: 'discord-app-api',
    corsOrigins: bootstrapModule.resolveDefaultDevelopmentCorsOrigins(),
    port: 3007,
  });
}

void bootstrap();
