// @requirements REQ-NOTIFY-AUDIENCE-004
import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AuditLogAdminModule } from '@app/backend-feature-audit-log-admin';
import { AdminNotificationsController } from './admin-notifications.controller';
import { NotificationAdminApiModule } from './notification-admin-api.module';

describe('NotificationAdminApiModule', () => {
  it('owns the notification admin controller and composes audit support', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, NotificationAdminApiModule)).toEqual([
      AdminNotificationsController,
    ]);
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, NotificationAdminApiModule)).toContain(AuditLogAdminModule);
  });
});
