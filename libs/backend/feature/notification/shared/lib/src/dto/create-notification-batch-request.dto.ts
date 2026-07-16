import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  notificationDeliveryChannels,
  type NotificationData,
  type NotificationDeliveryChannel,
  type NotificationExtra,
  NotificationPriority,
  NotificationTargetType,
} from '@app/common-notifications';

export class BatchItemDto {
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

export class CreateNotificationBatchRequestDto {
  @IsEnum(NotificationTargetType)
  targetType!: NotificationTargetType;

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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchItemDto)
  items!: BatchItemDto[];
}
