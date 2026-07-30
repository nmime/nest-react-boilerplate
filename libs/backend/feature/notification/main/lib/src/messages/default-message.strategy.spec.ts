// @requirements REQ-NOTIFY-TEMPLATE-003
import { describe, expect, it } from 'vitest';
import {
  NotificationChannel,
  NotificationTargetType,
  NotificationTemplateEngine,
  type NotificationRecord,
} from '@app/common-notifications';
import { DefaultMessageStrategy } from './default-message.strategy';

describe(DefaultMessageStrategy.name, () => {
  it('renders the requested channel without a legacy template fallback', () => {
    const notification: NotificationRecord = {
      id: 'notification-1',
      targetType: NotificationTargetType.TelegramChat,
      targetId: '123',
      data: { name: 'Ada' },
      sensitiveData: null,
      extra: null,
      inAppVisible: true,
      templateVersionId: 'version-1',
      createdAt: new Date(),
      template: {
        id: 'template-1',
        code: 'welcome',
        description: null,
        channels: {
          [NotificationChannel.Bot]: {
            id: 'channel-1',
            channel: NotificationChannel.Bot,
            engine: NotificationTemplateEngine.StringFormat,
            content: { body: { en: 'Hello {name}' } },
          },
        },
      },
    };

    expect(new DefaultMessageStrategy(notification, NotificationChannel.Bot).getMessage('en')).toEqual({
      kind: 'bot',
      text: 'Hello Ada',
      image: undefined,
      buttons: undefined,
    });
  });

  it('renders localized HTML email and push media/actions through the common message contract', () => {
    const notification: NotificationRecord = {
      id: 'notification-2',
      targetType: NotificationTargetType.User,
      targetId: 'user-1',
      data: { name: 'Ada' },
      sensitiveData: null,
      extra: null,
      inAppVisible: true,
      templateVersionId: 'version-2',
      createdAt: new Date(),
      template: {
        id: 'template-2',
        code: 'release',
        description: null,
        channels: {
          [NotificationChannel.Email]: {
            id: 'email-channel',
            channel: NotificationChannel.Email,
            engine: NotificationTemplateEngine.StringFormat,
            content: {
              subject: { en: 'Hello {name}' },
              body: { en: 'Text for {name}' },
              html: { en: '<strong>Hello {name}</strong>' },
            },
          },
          [NotificationChannel.Push]: {
            id: 'push-channel',
            channel: NotificationChannel.Push,
            engine: NotificationTemplateEngine.StringFormat,
            content: {
              subject: { en: 'Release' },
              body: { en: 'Ready for {name}' },
              image: { en: 'https://example.com/image.png' },
              actions: { en: [{ text: 'Open', url: 'https://example.com' }] },
            },
          },
        },
      },
    };

    expect(new DefaultMessageStrategy(notification, NotificationChannel.Email).getMessage('en')).toMatchObject({
      html: '<strong>Hello Ada</strong>',
      kind: 'email',
      subject: 'Hello Ada',
      text: 'Text for Ada',
    });
    expect(new DefaultMessageStrategy(notification, NotificationChannel.Push).getMessage('en')).toEqual({
      actions: [{ text: 'Open', url: 'https://example.com' }],
      image: 'https://example.com/image.png',
      kind: 'push',
      subject: 'Release',
      text: 'Ready for Ada',
    });
  });
});
