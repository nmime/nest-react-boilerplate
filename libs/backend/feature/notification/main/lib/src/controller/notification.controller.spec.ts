// @requirements REQ-NOTIFY-LIFECYCLE-002
// Evidence for: REQ-NOTIFY-LIFECYCLE-002
import type { AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import { NotificationChannel, NotificationTargetType } from '@app/common-notifications';
import { describe, expect, it, vi } from 'vitest';
import { NotificationController } from './notification.controller';

const principal: AuthenticatedPrincipal = {
  subject: 'operator-1',
  tenantId: '11111111-1111-4111-8111-111111111111',
  roles: ['admin'],
  permissions: ['admin:notification-broadcasts:send'],
};

describe(NotificationController.name, () => {
  it('takes template ownership from the authenticated principal', async () => {
    const upsertTemplate = vi.fn().mockResolvedValue({ code: 'welcome' });
    const controller = new NotificationController({ upsertTemplate } as never);
    const body = {
      code: 'welcome',
      channels: [{ channel: NotificationChannel.Bot, content: { body: { en: 'Hello' } } }],
    };

    await expect(controller.upsertTemplate(body as never, principal)).resolves.toEqual({ code: 'welcome' });
    expect(upsertTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: principal.tenantId, code: 'welcome' }),
    );
  });

  it('takes ordinary-notification tenancy from the authenticated principal', async () => {
    const createTemplateNotification = vi.fn().mockResolvedValue({ id: 'notification-1' });
    const controller = new NotificationController({ createTemplateNotification } as never);
    const body = {
      targetType: NotificationTargetType.User,
      targetId: 'user-1',
      templateCode: 'welcome',
      channels: [NotificationChannel.Bot],
    };

    await expect(controller.createTemplateNotification(body as never, principal)).resolves.toEqual({
      id: 'notification-1',
      templateCode: 'welcome',
    });
    expect(createTemplateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: principal.tenantId, targetId: 'user-1', templateCode: 'welcome' }),
    );
  });

  it('applies the same principal tenant to every item in an ordinary-notification batch', async () => {
    const createTemplateNotificationsBatch = vi.fn().mockResolvedValue([{ id: 'one' }, { id: 'two' }]);
    const controller = new NotificationController({ createTemplateNotificationsBatch } as never);
    const body = {
      targetType: NotificationTargetType.User,
      items: [
        { targetId: 'user-1', templateCode: 'welcome' },
        { targetId: 'user-2', templateCode: 'welcome' },
      ],
    };

    await expect(controller.createTemplateNotificationsBatch(body as never, principal)).resolves.toEqual({
      ids: ['one', 'two'],
    });
    expect(createTemplateNotificationsBatch).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: principal.tenantId, items: expect.any(Array) }),
    );
  });
});
