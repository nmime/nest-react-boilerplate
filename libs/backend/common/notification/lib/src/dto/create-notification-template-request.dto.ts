import { IsEnum, IsOptional, IsString } from 'class-validator';
import { NotificationTemplateEngine } from '@app/backend-postgres-main-notification';

export class CreateNotificationTemplateRequestDto {
  @IsString()
  code!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsOptional()
  body?: Record<string, string>;

  @IsOptional()
  image?: Record<string, string>;

  @IsEnum(NotificationTemplateEngine)
  @IsOptional()
  templateEngine?: NotificationTemplateEngine;
}
