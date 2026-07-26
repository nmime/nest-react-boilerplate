// @requirements REQ-NOTIFY-LIFECYCLE-002
import { describe, it, expect } from 'vitest';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationSchedulerCapabilitiesModule } from './capabilities.generated';
import { NotificationSchedulerModule } from './notification-scheduler.module';

describe('NotificationSchedulerModule', () => {
  it('owns the cron runtime and imports notification delivery capabilities', () => {
    expect(NotificationSchedulerModule).toBeDefined();
    const imports = Reflect.getMetadata('imports', NotificationSchedulerModule) as Array<{
      module?: unknown;
    } | null>;
    expect(imports).toContain(NotificationSchedulerCapabilitiesModule);
    expect(imports.some((entry) => entry?.module === ScheduleModule)).toBe(true);
  });
});
