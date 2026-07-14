import { IsEnum, IsOptional, IsString } from 'class-validator';
import {
  NotificationChannel,
  NotificationPriority,
  NotificationTargetType,
} from '@app/backend-postgres-main-notification';

export class CreateNotificationRequestDto {
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsEnum(NotificationTargetType)
  targetType!: NotificationTargetType;

  @IsString()
  targetId!: string;

  @IsString()
  templateCode!: string;

  @IsEnum(NotificationPriority)
  @IsOptional()
  priority?: NotificationPriority;

  @IsOptional()
  data?: Record<string, unknown>;
}
