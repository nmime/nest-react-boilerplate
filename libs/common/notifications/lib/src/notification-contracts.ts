export enum NotificationChannel {
  Bot = 'bot',
  Email = 'email',
  Push = 'push',
  InApp = 'in_app',
}

export const notificationDeliveryChannels = [
  NotificationChannel.Bot,
  NotificationChannel.Email,
  NotificationChannel.Push,
] as const;

export type NotificationDeliveryChannel = (typeof notificationDeliveryChannels)[number];

export function isNotificationDeliveryChannel(value: NotificationChannel): value is NotificationDeliveryChannel {
  return notificationDeliveryChannels.some((channel) => channel === value);
}

export enum NotificationStatus {
  Pending = 'pending',
  Sent = 'sent',
  Error = 'error',
  Rejected = 'rejected',
}

export enum NotificationPriority {
  Low = 10,
  Default = 100,
  High = 1000,
}

export enum NotificationTargetType {
  User = 'user',
  Email = 'email',
  TelegramChat = 'telegram-chat',
  SystemTelegramChat = 'system-telegram-chat',
}

export enum NotificationTemplateEngine {
  StringFormat = 'string-format',
  Eta = 'eta',
}

export enum NotificationDeliveryProvider {
  TelegramBot = 'telegram-bot',
  DiscordBot = 'discord-bot',
  Resend = 'resend',
  MailPace = 'mailpace',
  GoogleFcm = 'google-fcm',
  AppleApns = 'apple-apns',
}

export enum NotificationErrorReason {
  BlockedBot = 'blocked-bot',
  TelegramUserDeactivated = 'telegram-user-deactivated',
  BotCantInitiateConversation = 'bot-cant-initiate-conversation',
  ChatNotFound = 'chat-not-found',
  ChatRestricted = 'chat-restricted',
  IncorrectTarget = 'incorrect-target',
  NetworkError = 'network-error',
  RateLimit = 'rate-limit',
  BadGateway = 'bad-gateway',
  NotFoundTargetStrategy = 'not-found-target-strategy',
  NotFoundMessageStrategy = 'not-found-message-strategy',
  NotFoundMessage = 'not-found-message',
  UnsupportedChannel = 'unsupported-channel',
  InvalidRecipient = 'invalid-recipient',
  ProviderConfiguration = 'provider-configuration',
  ProviderRejected = 'provider-rejected',
  UnknownError = 'unknown-error',
}

export interface NotificationError {
  reason: NotificationErrorReason;
  message?: string;
}

export type NotificationDataValue = string | number | boolean | null | NotificationData;
export interface NotificationData {
  [key: string]: NotificationDataValue;
}

export interface NotificationExtra {
  useLanguage?: string;
  disableNotification?: boolean;
  disableWebPagePreview?: boolean;
}

/**
 * Confidential values are encrypted by the notification persistence adapter.
 * They are intentionally separate from ordinary template data so bearer links,
 * OTPs, and similar credentials never land in plaintext JSONB columns.
 */
export type NotificationSensitiveData = NotificationData;

export interface NotificationMessageButton {
  text: string;
  callback?: string;
  webApp?: string;
  url?: string;
  switchInlineQuery?: string;
  iconCustomEmojiId?: string;
}

export interface NotificationBotChannelContent {
  body: Record<string, string>;
  image?: Record<string, string>;
  buttons?: Record<string, NotificationMessageButton[][]>;
}

export interface NotificationEmailAttachment {
  cid: string;
  source: string;
  contentType?: string;
  filename?: string;
  inline?: boolean;
}

export interface NotificationEmailChannelContent {
  subject: Record<string, string>;
  body: Record<string, string>;
  attachments?: Record<string, NotificationEmailAttachment[]>;
}

export interface NotificationPushChannelContent {
  subject?: Record<string, string>;
  body: Record<string, string>;
  image?: Record<string, string>;
  actions?: Record<string, NotificationMessageButton[]>;
}

export interface NotificationInAppChannelContent {
  subject?: Record<string, string>;
  body: Record<string, string>;
  image?: Record<string, string>;
  actions?: Record<string, NotificationMessageButton[]>;
}

export type NotificationTemplateChannelContent =
  | NotificationBotChannelContent
  | NotificationEmailChannelContent
  | NotificationPushChannelContent
  | NotificationInAppChannelContent;

export function isNotificationTemplateChannelContent(
  channel: NotificationChannel,
  value: unknown,
): value is NotificationTemplateChannelContent {
  if (!isRecord(value)) {
    return false;
  }
  if (channel === NotificationChannel.Email) {
    return isLocalizedText(value['subject']) && isLocalizedText(value['body']);
  }
  return isLocalizedText(value['body']);
}

function isLocalizedText(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) && Object.keys(value).length > 0 && Object.values(value).every((item) => typeof item === 'string')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface NotificationTemplateChannelRecord {
  id: string;
  channel: NotificationChannel;
  engine: NotificationTemplateEngine;
  content: NotificationTemplateChannelContent;
}

export interface NotificationTemplateRecord {
  id: string;
  code: string;
  description: string | null;
  channels: Partial<Record<NotificationChannel, NotificationTemplateChannelRecord>>;
}

export interface NotificationRecord<T = NotificationData> {
  id: string;
  targetType: NotificationTargetType;
  targetId: string;
  template: NotificationTemplateRecord;
  data: T | null;
  sensitiveData: NotificationSensitiveData | null;
  extra: NotificationExtra | null;
  inAppVisible: boolean;
  createdAt: Date;
}

export interface NotificationDeliveryRecord {
  id: string;
  notificationId: string;
  targetType: NotificationTargetType;
  targetId: string;
  channel: NotificationDeliveryChannel;
  status: NotificationStatus;
  error: NotificationError | null;
  attempts: number;
  provider: NotificationDeliveryProvider;
  priority: number;
  sendAfter: Date;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PendingNotificationDelivery<T = NotificationData> {
  delivery: NotificationDeliveryRecord;
  notification: NotificationRecord<T>;
}

export interface NotificationDeliveryResult {
  id: string;
  createdAt: Date;
  status: NotificationStatus;
  error?: NotificationError | null;
}
