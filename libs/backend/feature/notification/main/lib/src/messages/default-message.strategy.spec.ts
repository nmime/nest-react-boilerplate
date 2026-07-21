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
});
