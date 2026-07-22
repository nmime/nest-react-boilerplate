import type { TranslationKey, TranslationParams } from '@app/frontend-runtime';

type Translate = (key: TranslationKey, params?: TranslationParams) => string;

type NotificationChannel = 'bot' | 'email' | 'in_app' | 'push';
type NotificationProvider = 'apple-apns' | 'discord-bot' | 'google-fcm' | 'mailpace' | 'resend' | 'telegram-bot';

type Option<Value extends string> = Readonly<{
  labelKey: TranslationKey;
  value: Value;
}>;

const notificationChannelOptions = [
  { labelKey: 'admin.notification.option.channel.email', value: 'email' },
  { labelKey: 'admin.notification.option.channel.bot', value: 'bot' },
  { labelKey: 'admin.notification.option.channel.push', value: 'push' },
] as const satisfies readonly Option<Exclude<NotificationChannel, 'in_app'>>[];

const notificationProviderOptions = {
  bot: [
    { labelKey: 'admin.notification.option.provider.telegramBot', value: 'telegram-bot' },
    { labelKey: 'admin.notification.option.provider.discordBot', value: 'discord-bot' },
  ],
  email: [
    { labelKey: 'admin.notification.option.provider.resend', value: 'resend' },
    { labelKey: 'admin.notification.option.provider.mailPace', value: 'mailpace' },
  ],
  in_app: [],
  push: [
    { labelKey: 'admin.notification.option.provider.googleFcm', value: 'google-fcm' },
    { labelKey: 'admin.notification.option.provider.appleApns', value: 'apple-apns' },
  ],
} as const satisfies Record<NotificationChannel, readonly Option<NotificationProvider>[]>;

const notificationSegmentKindOptions = [
  { labelKey: 'admin.notification.option.segment.dynamic', value: 'dynamic' },
  { labelKey: 'admin.notification.option.segment.static', value: 'static' },
] as const;

const translateOptions = <Value extends string>(options: readonly Option<Value>[], t: Translate) =>
  options.map(({ labelKey, value }) => ({ label: t(labelKey), value }));

export const getNotificationChannelOptions = (t: Translate) => translateOptions(notificationChannelOptions, t);

export const getNotificationProviderOptions = (channel: NotificationChannel, t: Translate) =>
  translateOptions(notificationProviderOptions[channel], t);

export const getDefaultNotificationProvider = (channel: NotificationChannel): NotificationProvider | undefined =>
  notificationProviderOptions[channel][0]?.value;

export const getNotificationSegmentKindOptions = (t: Translate) => translateOptions(notificationSegmentKindOptions, t);
