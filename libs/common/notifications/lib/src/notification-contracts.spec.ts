import { describe, expect, it } from 'vitest';
// Domain evidence for REQ-NOTIFY-DELIVERY-001.
import {
  isNotificationDeliveryChannel,
  isNotificationTemplateChannelContent,
  NotificationChannel,
  notificationDeliveryChannels,
  NotificationStatus,
} from './notification-contracts';

describe('notification contracts', () => {
  it('keeps in-app as feed content rather than a delivery queue channel', () => {
    expect(notificationDeliveryChannels).toEqual([
      NotificationChannel.Bot,
      NotificationChannel.Email,
      NotificationChannel.Push,
    ]);
    expect(isNotificationDeliveryChannel(NotificationChannel.Bot)).toBe(true);
    expect(isNotificationDeliveryChannel(NotificationChannel.InApp)).toBe(false);
  });

  it('exposes terminal and retryable delivery states', () => {
    expect(NotificationStatus).toEqual({
      Pending: 'pending',
      Paused: 'paused',
      Sent: 'sent',
      Error: 'error',
      Rejected: 'rejected',
      Cancelled: 'cancelled',
    });
  });

  it('validates channel-specific template content', () => {
    expect(isNotificationTemplateChannelContent(NotificationChannel.Bot, null)).toBe(false);
    expect(isNotificationTemplateChannelContent(NotificationChannel.Bot, { body: { en: 'Hello' } })).toBe(true);
    expect(
      isNotificationTemplateChannelContent(NotificationChannel.Email, {
        subject: { en: 'Hello' },
        body: { en: 'World' },
      }),
    ).toBe(true);
    expect(isNotificationTemplateChannelContent(NotificationChannel.Email, { body: { en: 'World' } })).toBe(false);
    expect(isNotificationTemplateChannelContent(NotificationChannel.InApp, { subject: { en: 'Missing body' } })).toBe(
      false,
    );
  });
});
