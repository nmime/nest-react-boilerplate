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
      return null;
    }
    const telegramIdentity = identitiesResult.value.find((identity) => identity.provider === 'telegram');
    return telegramIdentity
      ? { address: telegramIdentity.providerSubject, language: telegramIdentity.locale ?? undefined }
      : null;
  }
}
