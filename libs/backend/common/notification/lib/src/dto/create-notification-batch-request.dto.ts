import { IsArray, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationChannel, NotificationPriority, NotificationTargetType } from '@app/backend-postgres-main-notification';

export class BatchItemDto {
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

export class CreateNotificationBatchRequestDto {
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsEnum(NotificationTargetType)
  targetType!: NotificationTargetType;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchItemDto)
  items!: BatchItemDto[];
}
