import { Injectable } from '@nestjs/common';
import { ExternalIdentityRepository } from '@app/backend-postgres-main-auth';
import {
  NotificationRecipientResolver,
  type ResolvedNotificationRecipient,
} from '@app/backend-feature-notification-shared';
import {
  NotificationChannel,
  type NotificationDeliveryChannel,
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
  constructor(private readonly externalIdentityRepository: ExternalIdentityRepository) {
    super();
  }

  async resolve(
    targetType: NotificationTargetType,
    targetId: string,
    channel: NotificationDeliveryChannel,
  ): Promise<ResolvedNotificationRecipient | null> {
    if (channel !== NotificationChannel.Bot) {
      return null;
    }
    if (
      targetType === NotificationTargetType.TelegramChat ||
      targetType === NotificationTargetType.SystemTelegramChat
    ) {
      return { address: targetId };
    }

    const identitiesResult = await this.externalIdentityRepository.findByUser(targetId);
    if (identitiesResult.isErr()) {
      // A transient repository failure is not the same as "no recipient": throw so the
      // delivery is retried instead of being permanently marked as an incorrect target.
      throw new NotificationRecipientLookupError(targetType, targetId, identitiesResult.error.message);
    }
    const telegramIdentity = identitiesResult.value.find((identity) => identity.provider === 'telegram');
    return telegramIdentity
      ? { address: telegramIdentity.providerSubject, language: telegramIdentity.locale ?? undefined }
      : null;
  }
}
