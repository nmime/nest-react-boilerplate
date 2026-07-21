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
import { NotificationDeliveryRouteDto } from './notification-delivery-route.dto';

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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationDeliveryRouteDto)
  @IsOptional()
  deliveries?: NotificationDeliveryRouteDto[];

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
