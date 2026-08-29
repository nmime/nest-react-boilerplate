// @requirements REQ-NOTIFY-PERSISTENCE-005
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bootstrapNestApi, resolveDefaultDevelopmentCorsOrigins } from './bootstrap.runtime';
import { NotificationSchedulerModule } from './notification-scheduler.module';

describe('notification-scheduler bootstrap', () => {
  it('uses the shared API host bootstrap while retaining the scheduler root module', () => {
    const source = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

    expect(bootstrapNestApi).toBeTypeOf('function');
    expect(resolveDefaultDevelopmentCorsOrigins).toBeTypeOf('function');
    expect(NotificationSchedulerModule).toBeDefined();
    expect(source).toContain('bootstrapNestApi(appModule.NotificationSchedulerModule');
    expect(source).toContain("appName: 'notification-scheduler'");
    expect(source).toContain('port: 3005');
    expect(source).not.toContain('createApplicationContext');
  });
});
