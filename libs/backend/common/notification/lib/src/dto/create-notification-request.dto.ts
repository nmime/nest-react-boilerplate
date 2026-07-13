import { IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationChannel, NotificationPriority, NotificationTargetType } from '@app/backend-postgres-main-notification';

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
