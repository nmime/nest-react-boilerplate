import { describe, expect, it, vi } from 'vitest';
import { NotificationApplicationService } from './notification-application.service';

describe(NotificationApplicationService.name, () => {
  it('delegates template and immutable notification writes to persistence', async () => {
    const template = { id: 'template-1', code: 'welcome' };
    const notification = { id: 'notification-1', templateCode: 'welcome' };
    const batch = [notification, { id: 'notification-2', templateCode: 'welcome' }];
    const persistence = {
      upsertTemplate: vi.fn().mockResolvedValue(template),
      create: vi.fn().mockResolvedValue(notification),
      createBatch: vi.fn().mockResolvedValue(batch),
    };
    const service = new NotificationApplicationService(persistence as never);
    const templateParams = { code: 'welcome', channels: {} };
    const notificationParams = { targetId: 'user-1', templateCode: 'welcome' };
    const batchParams = { items: [notificationParams] };

    await expect(service.upsertTemplate(templateParams as never)).resolves.toBe(template);
    await expect(service.createTemplateNotification(notificationParams as never)).resolves.toBe(notification);
    await expect(service.createTemplateNotificationsBatch(batchParams as never)).resolves.toBe(batch);
    expect(persistence.upsertTemplate).toHaveBeenCalledWith(templateParams);
    expect(persistence.create).toHaveBeenCalledWith(notificationParams);
    expect(persistence.createBatch).toHaveBeenCalledWith(batchParams);
  });
});
