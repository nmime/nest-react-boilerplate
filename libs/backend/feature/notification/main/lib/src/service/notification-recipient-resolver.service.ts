import { Inject, Injectable } from '@nestjs/common';
import {
  AuthProvider,
  AuthUserRepositoryInjectToken,
  ExternalIdentityRepositoryInjectToken,
  type AuthUserRepositoryPort,
  type ExternalIdentityRepositoryPort,
} from '@app/backend-feature-auth-shared';
import {
  NotificationRecipientResolver,
  type ResolvedNotificationRecipient,
} from '@app/backend-feature-notification-shared';
import {
  NotificationChannel,
  NotificationDeliveryProvider,
  type NotificationDeliveryRecord,
  NotificationTargetType,
} from '@app/common-notifications';

/**
 * Raised when the recipient lookup fails because of an infrastructure error
 * (e.g. the auth database is momentarily unavailable). This must be
 * distinguished from a successful lookup that yields no recipient: the former
 * is transient and the delivery should be retried, whereas the latter is a
 * terminal "incorrect target".
 */
export class NotificationRecipientLookupError extends Error {
  constructor(
    readonly targetType: NotificationTargetType,
    readonly targetId: string,
    reason: string,
  ) {
    super(`Failed to resolve notification recipient for ${targetType}/${targetId}: ${reason}`);
    this.name = 'NotificationRecipientLookupError';
  }
}

@Injectable()
export class NotificationRecipientResolverService extends NotificationRecipientResolver {
  constructor(
    @Inject(ExternalIdentityRepositoryInjectToken)
    private readonly externalIdentityRepository: ExternalIdentityRepositoryPort,
    @Inject(AuthUserRepositoryInjectToken)
    private readonly authUserRepository: AuthUserRepositoryPort,
  ) {
    super();
  }

  async resolve(
    targetType: NotificationTargetType,
    targetId: string,
    delivery: NotificationDeliveryRecord,
  ): Promise<ResolvedNotificationRecipient | null> {
    if (
      delivery.channel === NotificationChannel.Push &&
      targetType === NotificationTargetType.PushToken &&
      (delivery.provider === NotificationDeliveryProvider.GoogleFcm ||
        delivery.provider === NotificationDeliveryProvider.AppleApns)
    ) {
      return isPushToken(targetId) ? { address: targetId } : null;
    }
    if (
      (delivery.provider === NotificationDeliveryProvider.Resend ||
        delivery.provider === NotificationDeliveryProvider.MailPace) &&
      delivery.channel === NotificationChannel.Email
    ) {
      return this.resolveEmail(targetType, targetId);
    }
    if (delivery.channel !== NotificationChannel.Bot) {
      return null;
    }

    if (delivery.provider === NotificationDeliveryProvider.TelegramBot && this.isTelegramTarget(targetType)) {
      return { address: targetId };
    }
    if (targetType !== NotificationTargetType.User) {
      return null;
    }

    const identitiesResult = await this.externalIdentityRepository.findByUser(targetId);
    if (identitiesResult.isErr()) {
      // A transient repository failure is not the same as "no recipient": throw so the
      // delivery is retried instead of being permanently marked as an incorrect target.
      throw new NotificationRecipientLookupError(targetType, targetId, identitiesResult.error.message);
    }
    const provider =
      delivery.provider === NotificationDeliveryProvider.TelegramBot ? AuthProvider.Telegram : AuthProvider.Discord;
    if (
      delivery.provider !== NotificationDeliveryProvider.TelegramBot &&
      delivery.provider !== NotificationDeliveryProvider.DiscordBot
    ) {
      return null;
    }
    const identity = identitiesResult.value.find((item) => item.provider === provider);
    return identity ? { address: identity.providerSubject, language: identity.locale ?? undefined } : null;
  }

  private async resolveEmail(
    targetType: NotificationTargetType,
    targetId: string,
  ): Promise<ResolvedNotificationRecipient | null> {
    if (targetType === NotificationTargetType.Email) {
      return isEmailAddress(targetId) ? { address: targetId.trim().toLowerCase() } : null;
    }
    if (targetType !== NotificationTargetType.User) {
      return null;
    }
    const userResult = await this.authUserRepository.findById(targetId);
    if (userResult.isErr()) {
      throw new NotificationRecipientLookupError(targetType, targetId, userResult.error.message);
    }
    const user = userResult.value;
    return user?.email && isEmailAddress(user.email) ? { address: user.email, language: user.locale } : null;
  }

  private isTelegramTarget(targetType: NotificationTargetType): boolean {
    return (
      targetType === NotificationTargetType.TelegramChat || targetType === NotificationTargetType.SystemTelegramChat
    );
  }
}

function isEmailAddress(value: string): boolean {
  return isStructurallyValidEmail(value.trim());
}

function isStructurallyValidEmail(value: string): boolean {
  if (value.length === 0 || value.length > 320 || [...value].some((character) => /\s/u.test(character))) {
    return false;
  }
  const at = value.indexOf('@');
  const dot = value.lastIndexOf('.');
  return at > 0 && at === value.lastIndexOf('@') && dot > at + 1 && dot < value.length - 1;
}

function isPushToken(value: string): boolean {
  return value.length >= 16 && value.length <= 4096 && !/\s/u.test(value);
}
