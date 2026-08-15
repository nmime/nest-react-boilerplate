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
  Paused = 'paused',
  Sent = 'sent',
  Error = 'error',
  Rejected = 'rejected',
  Cancelled = 'cancelled',
}

export enum NotificationPriority {
  Low = 10,
  Default = 100,
  High = 1000,
}

export enum NotificationTargetType {
  User = 'user',
  Email = 'email',
  PushToken = 'push-token',
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
  InvalidMessage = 'invalid-message',
  UnsupportedChannel = 'unsupported-channel',
  InvalidRecipient = 'invalid-recipient',
  ProviderConfiguration = 'provider-configuration',
  ProviderRejected = 'provider-rejected',
  /**
   * Dispatch reached the provider and the outcome is unknown (timeout / network
   * error on a non-idempotent provider). Automatic retry is suspended: the
   * delivery is persisted as a terminal Error with this reason and is never
   * re-claimed by the scheduler, because re-dispatch could duplicate the send.
   */
  Quarantined = 'quarantined',
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
  linkPreviewUrl?: string;
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
  html?: Record<string, string>;
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
  source?: NotificationTemplateSource;
  name?: string;
  status?: NotificationTemplateStatus;
  versionId?: string;
  version?: number;
  variablesSchema?: NotificationVariablesSchema;
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
  broadcastId?: string | null;
  templateVersionId: string;
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
  broadcastId?: string | null;
  priority: number;
  sendAfter: Date;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PendingNotificationDelivery<T = NotificationData> {
  claimToken: string;
  delivery: NotificationDeliveryRecord;
  notification: NotificationRecord<T>;
}

export interface NotificationDeliveryResult {
  id: string;
  createdAt: Date;
  claimToken: string;
  status: NotificationStatus;
  error?: NotificationError | null;
  retryAfterSeconds?: number;
}

export enum NotificationTemplateSource {
  Code = 'code',
  Admin = 'admin',
}

export enum NotificationTemplateStatus {
  Draft = 'draft',
  Published = 'published',
  Archived = 'archived',
}

export type NotificationVariableType = 'string' | 'number' | 'boolean' | 'url' | 'date-time';

export interface NotificationVariableDefinition {
  type: NotificationVariableType;
  required?: boolean;
  example?: string | number | boolean;
  sensitive?: boolean;
}

export type NotificationVariablesSchema = Record<string, NotificationVariableDefinition>;

export enum NotificationSegmentKind {
  Static = 'static',
  Dynamic = 'dynamic',
}

export enum NotificationSegmentStatus {
  Active = 'active',
  Archived = 'archived',
}

export enum NotificationSegmentUploadStatus {
  Pending = 'pending',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
}

export enum NotificationAudienceSnapshotStatus {
  Created = 'created',
  Collecting = 'collecting',
  Completed = 'completed',
  Failed = 'failed',
}

export enum NotificationBroadcastStatus {
  Draft = 'draft',
  Collecting = 'collecting',
  Ready = 'ready',
  Scheduled = 'scheduled',
  Sending = 'sending',
  Paused = 'paused',
  Completed = 'completed',
  Cancelled = 'cancelled',
  Failed = 'failed',
}

export interface NotificationAudienceMember {
  targetType: NotificationTargetType;
  targetId: string;
  language?: string;
  variables?: NotificationData;
}

export interface NotificationTemplateVersionRecord {
  id: string;
  templateId: string;
  version: number;
  variablesSchema: NotificationVariablesSchema;
  channels: Partial<Record<NotificationChannel, NotificationTemplateChannelRecord>>;
  publishedAt: Date | null;
  publishedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationTemplateAdminRecord {
  id: string;
  tenantId: string | null;
  code: string;
  name: string;
  description: string | null;
  source: NotificationTemplateSource;
  status: NotificationTemplateStatus;
  currentVersionId: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  versions: NotificationTemplateVersionRecord[];
}

export interface NotificationSegmentRecord {
  id: string;
  tenantId: string;
  name: string;
  kind: NotificationSegmentKind;
  resolverKey: string | null;
  parameters: NotificationData;
  status: NotificationSegmentStatus;
  memberCount: number;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationSegmentUploadRecord {
  id: string;
  segmentId: string;
  objectKey: string;
  checksum: string;
  status: NotificationSegmentUploadStatus;
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  invalidRows: number;
  errors: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationAudienceSnapshotRecord {
  id: string;
  broadcastId: string;
  snapshotAt: Date;
  status: NotificationAudienceSnapshotStatus;
  resolvedCount: number;
  distinctCount: number;
  duplicateCount: number;
  conflictCount: number;
  invalidCount: number;
  error: NotificationError | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationBroadcastRecord {
  id: string;
  tenantId: string;
  name: string;
  templateVersionId: string;
  channel: NotificationDeliveryChannel;
  provider: NotificationDeliveryProvider;
  priority: number;
  status: NotificationBroadcastStatus;
  scheduledAt: Date | null;
  globalVariables: NotificationData;
  segmentIds: string[];
  snapshot: NotificationAudienceSnapshotRecord | null;
  snapshotCount: number;
  queuedCount: number;
  sentCount: number;
  rejectedCount: number;
  errorCount: number;
  pendingCount: number;
  cancelledCount: number;
  materializedAt: Date | null;
  createdBy: string;
  approvedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}
