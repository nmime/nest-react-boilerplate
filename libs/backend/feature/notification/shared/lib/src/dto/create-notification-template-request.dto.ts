import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsEnum, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { NotificationChannel, NotificationTemplateEngine } from '@app/common-notifications';
import type { NotificationTemplateChannelContent } from '@app/common-notifications';

export class UpsertNotificationTemplateChannelRequestDto {
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsEnum(NotificationTemplateEngine)
  @IsOptional()
  engine?: NotificationTemplateEngine;

  @IsObject()
  content!: NotificationTemplateChannelContent;
}

export class UpsertNotificationTemplateRequestDto {
  @IsString()
  code!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => UpsertNotificationTemplateChannelRequestDto)
  channels!: UpsertNotificationTemplateChannelRequestDto[];
}
