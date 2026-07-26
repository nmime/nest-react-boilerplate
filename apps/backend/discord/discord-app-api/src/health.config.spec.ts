// @requirements REQ-SOCIAL-INGRESS-001
import type { ValueProvider } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { HealthService } from '@app/backend-common-health';
import { DiscordAppApiHealthServiceProvider } from './health.config';

describe('DiscordAppApiHealthServiceProvider', () => {
  it('identifies the app and requires the public interaction configuration', async () => {
    const service = (DiscordAppApiHealthServiceProvider as ValueProvider<HealthService>).useValue;
    expect(service).toBeInstanceOf(HealthService);
    if (!(service instanceof HealthService)) {
      throw new Error('Discord health provider must contain a HealthService value.');
    }
    const previousApplicationId = process.env.DISCORD_APPLICATION_ID;
    const previousPublicKey = process.env.DISCORD_PUBLIC_KEY;

    delete process.env.DISCORD_APPLICATION_ID;
    delete process.env.DISCORD_PUBLIC_KEY;
    try {
      expect(service.appName).toBe('discord-app-api');
      const readiness = await service.checkReadiness();
      expect(readiness.data.status).toBe('error');
      expect(readiness.data.checks?.find(({ name }) => name === 'discord-bot-config')?.required).toBe(true);
    } finally {
      restoreEnv('DISCORD_APPLICATION_ID', previousApplicationId);
      restoreEnv('DISCORD_PUBLIC_KEY', previousPublicKey);
    }
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
