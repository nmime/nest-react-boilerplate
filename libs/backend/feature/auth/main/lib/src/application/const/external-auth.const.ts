import {
  AuthProvider,
  AuthProviderChannel,
  type ExternalAuthProvider,
  type ExternalAuthProviderChannel,
} from '@app/backend-feature-auth-shared';
import type { ExternalIdentityRecord } from '../../infrastructure';

export const DefaultLinkTokenTtlSeconds = 10 * 60;
export const DefaultDiscordStateTtlSeconds = 10 * 60;
export const DefaultTelegramMaxAgeSeconds = 24 * 60 * 60;
export const DefaultMaxDiscordStateEntries = 10_000;
export const ExternalAccountPasswordSeed = ['external-auth-account', 'without-local-credential'].join(':');
export const externalAuthProviderByStorageValue = {
  [AuthProvider.Telegram]: AuthProvider.Telegram,
  [AuthProvider.Discord]: AuthProvider.Discord,
} satisfies Record<ExternalIdentityRecord['provider'], ExternalAuthProvider>;
export const externalAuthProviderChannelByStorageValue = {
  [AuthProviderChannel.TelegramWebLogin]: AuthProviderChannel.TelegramWebLogin,
  [AuthProviderChannel.TelegramTma]: AuthProviderChannel.TelegramTma,
  [AuthProviderChannel.TelegramBot]: AuthProviderChannel.TelegramBot,
  [AuthProviderChannel.DiscordOauth]: AuthProviderChannel.DiscordOauth,
  [AuthProviderChannel.DiscordBot]: AuthProviderChannel.DiscordBot,
} satisfies Record<ExternalIdentityRecord['channel'], ExternalAuthProviderChannel>;
