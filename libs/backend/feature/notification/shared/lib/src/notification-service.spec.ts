// @requirements REQ-NOTIFY-TEMPLATE-003
import { describe, it, expect } from 'vitest';
import { NotificationService } from './notification-service';

describe(NotificationService.name, () => {
  it('should be defined as a class', () => {
    expect(NotificationService).toBeDefined();
  });

  it('should have abstract createTemplateNotification method', () => {
    expect(NotificationService.prototype.createTemplateNotification).toBeUndefined();
  });

  it('should have abstract createTemplateNotificationsBatch method', () => {
    expect(NotificationService.prototype.createTemplateNotificationsBatch).toBeUndefined();
  });
});
