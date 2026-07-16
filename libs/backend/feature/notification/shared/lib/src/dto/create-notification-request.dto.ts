import { IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import {
  notificationDeliveryChannels,
  type NotificationData,
  type NotificationDeliveryChannel,
  type NotificationExtra,
  NotificationPriority,
  NotificationTargetType,
} from '@app/common-notifications';

export class CreateNotificationRequestDto {
  @IsEnum(NotificationTargetType)
  targetType!: NotificationTargetType;

  @IsString()
  targetId!: string;

  @IsString()
  templateCode!: string;

  @IsArray()
  @IsIn(notificationDeliveryChannels, { each: true })
  @IsOptional()
  channels?: NotificationDeliveryChannel[];

  @IsBoolean()
  @IsOptional()
  inAppVisible?: boolean;

  @IsEnum(NotificationPriority)
  @IsOptional()
  priority?: NotificationPriority;

  @IsDateString()
  @IsOptional()
  sendAfter?: string;

  @IsObject()
  @IsOptional()
  data?: NotificationData;

  @IsObject()
  @IsOptional()
  extra?: NotificationExtra;
}
