import { IsEnum, IsIn, IsString } from 'class-validator';
import {
  notificationDeliveryChannels,
  NotificationDeliveryProvider,
  type NotificationDeliveryChannel,
} from '@app/common-notifications';

/** Explicit immutable provider selection for a public notification creation request. */
export class NotificationDeliveryRouteDto {
  @IsString()
  @IsIn(notificationDeliveryChannels)
  channel!: NotificationDeliveryChannel;

  @IsEnum(NotificationDeliveryProvider)
  provider!: NotificationDeliveryProvider;
}
