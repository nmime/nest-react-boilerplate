import type { Provider } from '@nestjs/common';
import { EnvHealthIndicator, HealthService, RuntimeHealthIndicator } from '@app/backend-common-health';
import { RedisHealthIndicator } from '@app/backend-common-redis';

export const DiscordAppApiHealthServiceProvider: Provider = {
  provide: HealthService,
  useFactory: (redisHealth: RedisHealthIndicator) =>
    new HealthService({
      appName: 'discord-app-api',
      indicators: [
        new RuntimeHealthIndicator(),
        new EnvHealthIndicator({
          name: 'discord-bot-config',
          required: true,
          requiredVariables: ['DISCORD_APPLICATION_ID', 'DISCORD_PUBLIC_KEY'],
          optionalVariables: [
            'DISCORD_BOT_TOKEN',
            'DISCORD_COMMAND_REGISTRATION_ENABLED',
            'DISCORD_REGISTRATION_GUILD_ID',
            'DISCORD_WEB_APP_BASE_URL',
          ],
        }),
        redisHealth,
      ],
    }),
  inject: [RedisHealthIndicator],
};
