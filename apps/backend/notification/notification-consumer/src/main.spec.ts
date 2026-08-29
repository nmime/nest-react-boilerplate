// @requirements REQ-NOTIFY-PERSISTENCE-005
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bootstrapNestApi, resolveDefaultDevelopmentCorsOrigins } from './bootstrap.runtime';
import { NotificationConsumerModule } from './notification-consumer.module';

describe('notification-consumer bootstrap', () => {
  it('uses the shared API host bootstrap while retaining the consumer root module', () => {
    const source = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

    expect(bootstrapNestApi).toBeTypeOf('function');
    expect(resolveDefaultDevelopmentCorsOrigins).toBeTypeOf('function');
    expect(NotificationConsumerModule).toBeDefined();
    expect(source).toContain('bootstrapNestApi(appModule.NotificationConsumerModule');
    expect(source).toContain("appName: 'notification-consumer'");
    expect(source).toContain('port: 3004');
    expect(source).not.toContain('createApplicationContext');
  });
});
