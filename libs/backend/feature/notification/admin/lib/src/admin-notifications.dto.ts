import { Type } from 'class-transformer';
// DTOs belong to the notification administration transport boundary.
import {
  ArrayNotEmpty,
  IsArray,
  IsBase64,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  NotificationBroadcastStatus,
  NotificationChannel,
  NotificationDeliveryProvider,
  NotificationSegmentKind,
  NotificationTargetType,
  NotificationTemplateEngine,
} from '@app/common-notifications';

export class AdminNotificationTemplateChannelInputDto {
  @ApiProperty({ enum: NotificationChannel })
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @ApiPropertyOptional({ enum: NotificationTemplateEngine, default: NotificationTemplateEngine.StringFormat })
  @IsOptional()
  @IsEnum(NotificationTemplateEngine)
  engine?: NotificationTemplateEngine;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  content!: Record<string, unknown>;
}

export class CreateAdminNotificationTemplateDto {
  @ApiProperty({ example: 'weekly-update' })
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{2,127}$/u)
  code!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, default: {} })
  @IsOptional()
  @IsObject()
  variablesSchema?: Record<string, unknown>;

  @ApiProperty({ type: [AdminNotificationTemplateChannelInputDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AdminNotificationTemplateChannelInputDto)
  channels!: AdminNotificationTemplateChannelInputDto[];
}

export class UpdateAdminNotificationTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  variablesSchema?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [AdminNotificationTemplateChannelInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminNotificationTemplateChannelInputDto)
  channels?: AdminNotificationTemplateChannelInputDto[];

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;
}

export class PreviewAdminNotificationTemplateDto {
  @ApiProperty({ enum: [NotificationChannel.Bot, NotificationChannel.Email, NotificationChannel.Push] })
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel.Bot | NotificationChannel.Email | NotificationChannel.Push;

  @ApiProperty({ default: 'en' })
  @IsString()
  language!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  variables!: Record<string, unknown>;
}

export class TestSendAdminNotificationTemplateDto extends PreviewAdminNotificationTemplateDto {
  @ApiProperty({ enum: NotificationTargetType })
  @IsEnum(NotificationTargetType)
  targetType!: NotificationTargetType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(320)
  targetId!: string;

  @ApiProperty({ enum: NotificationDeliveryProvider })
  @IsEnum(NotificationDeliveryProvider)
  provider!: NotificationDeliveryProvider;
}

export class CreateAdminNotificationSegmentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @ApiProperty({ enum: NotificationSegmentKind })
  @IsEnum(NotificationSegmentKind)
  kind!: NotificationSegmentKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  resolverKey?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, default: {} })
  @IsOptional()
  @IsObject()
  parameters?: Record<string, unknown>;
}

export class UpdateAdminNotificationSegmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  resolverKey?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  parameters?: Record<string, unknown>;
}

export class UploadAdminNotificationSegmentCsvDto {
  @ApiProperty({ example: 'audience.csv' })
  @IsString()
  @MaxLength(255)
  filename!: string;

  @ApiProperty({ description: 'Base64-encoded UTF-8 CSV bytes.' })
  @IsBase64()
  contentBase64!: string;
}

export class CreateAdminNotificationBroadcastDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  templateVersionId!: string;

  @ApiProperty({ enum: [NotificationChannel.Bot, NotificationChannel.Email, NotificationChannel.Push] })
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel.Bot | NotificationChannel.Email | NotificationChannel.Push;

  @ApiProperty({ enum: NotificationDeliveryProvider })
  @IsEnum(NotificationDeliveryProvider)
  provider!: NotificationDeliveryProvider;

  @ApiPropertyOptional({ minimum: 0, maximum: 10, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  priority?: number;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, default: {} })
  @IsOptional()
  @IsObject()
  globalVariables?: Record<string, unknown>;

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  segmentIds!: string[];
}

export class UpdateAdminNotificationBroadcastDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  templateVersionId?: string;

  @ApiPropertyOptional({ enum: NotificationChannel })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @ApiPropertyOptional({ enum: NotificationDeliveryProvider })
  @IsOptional()
  @IsEnum(NotificationDeliveryProvider)
  provider?: NotificationDeliveryProvider;

  @ApiPropertyOptional({ minimum: 0, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  priority?: number;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  globalVariables?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  segmentIds?: string[];
}

export class ScheduleAdminNotificationBroadcastDto {
  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  scheduledAt!: string;
}

export class AdminNotificationBroadcastQueryDto {
  @ApiPropertyOptional({ enum: NotificationBroadcastStatus })
  @IsOptional()
  @IsEnum(NotificationBroadcastStatus)
  status?: NotificationBroadcastStatus;
}

export class AdminNotificationArchivedQueryDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeArchived?: boolean;
}

export class AdminNotificationTemplateViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) description!: string | null;
  @ApiProperty() source!: string;
  @ApiProperty() status!: string;
  @ApiPropertyOptional({ nullable: true }) currentVersionId!: string | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: () => [AdminNotificationTemplateVersionViewDto] })
  versions!: AdminNotificationTemplateVersionViewDto[];
}

export class AdminNotificationTemplateVersionViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ type: 'object', additionalProperties: true }) variablesSchema!: Record<string, unknown>;
  @ApiProperty({ type: 'object', additionalProperties: true }) channels!: Record<string, unknown>;
  @ApiPropertyOptional({ nullable: true, format: 'date-time' }) publishedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class AdminNotificationTemplateListDto {
  @ApiProperty({ type: [AdminNotificationTemplateViewDto] }) items!: AdminNotificationTemplateViewDto[];
}

export class AdminNotificationSegmentViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() kind!: string;
  @ApiProperty() status!: string;
  @ApiProperty() memberCount!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) resolverKey!: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true }) parameters!: Record<string, unknown>;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class AdminNotificationSegmentListDto {
  @ApiProperty({ type: [AdminNotificationSegmentViewDto] }) items!: AdminNotificationSegmentViewDto[];
}

export class AdminNotificationSegmentUploadViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() status!: string;
  @ApiProperty() totalRows!: number;
  @ApiProperty() validRows!: number;
  @ApiProperty() duplicateRows!: number;
  @ApiProperty() invalidRows!: number;
  @ApiProperty({ type: [String] }) errors!: string[];
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class AdminNotificationBroadcastViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() status!: string;
  @ApiProperty() snapshotCount!: number;
  @ApiProperty() queuedCount!: number;
  @ApiProperty() sentCount!: number;
  @ApiProperty() pendingCount!: number;
  @ApiProperty() templateVersionId!: string;
  @ApiProperty() channel!: string;
  @ApiProperty() provider!: string;
  @ApiProperty() priority!: number;
  @ApiProperty({ type: [String] }) segmentIds!: string[];
  @ApiProperty({ type: 'object', additionalProperties: true }) globalVariables!: Record<string, unknown>;
  @ApiProperty() rejectedCount!: number;
  @ApiProperty() errorCount!: number;
  @ApiProperty() cancelledCount!: number;
  @ApiPropertyOptional({ nullable: true, format: 'date-time' }) scheduledAt!: string | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class AdminNotificationBroadcastListDto {
  @ApiProperty({ type: [AdminNotificationBroadcastViewDto] }) items!: AdminNotificationBroadcastViewDto[];
}

export class AdminNotificationResolverListDto {
  @ApiProperty({ type: () => [AdminNotificationResolverViewDto] }) items!: AdminNotificationResolverViewDto[];
}

export class AdminNotificationResolverViewDto {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) parameterSchema!: Record<string, unknown>;
}

export class AdminNotificationEstimateDto {
  @ApiProperty() count!: number;
}

export class AdminNotificationPreviewDto {
  @ApiProperty({ type: 'object', additionalProperties: true }) message!: Record<string, unknown>;
}
