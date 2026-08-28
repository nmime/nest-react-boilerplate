import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ProblemPresentationDisplays,
  ProblemPresentationSeverities,
  type ProblemPresentationDisplay,
  type ProblemPresentationSeverity,
} from '@app/common-problem-details';

const StudioChanges = ['unchanged', 'new', 'modified', 'deleted'] as const;
const StudioMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'TRACE'] as const;
const toBoolean = ({ value }: { value: unknown }) => value === true || value === 'true';
export class ApiResponseStudioTextsDto {
  @ApiProperty({ type: String, isArray: true })
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  en!: string[];
  @ApiProperty({ type: String, isArray: true })
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  ru!: string[];
  @ApiProperty({ type: String, isArray: true })
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  zh!: string[];
}
export class ApiResponseStudioPresentationDto {
  @ApiProperty({ enum: ProblemPresentationDisplays })
  @IsIn(ProblemPresentationDisplays)
  display!: ProblemPresentationDisplay;
  @ApiProperty({ enum: ProblemPresentationSeverities })
  @IsIn(ProblemPresentationSeverities)
  severity!: ProblemPresentationSeverity;
  @ApiProperty() @IsBoolean() support!: boolean;
  @ApiProperty() @IsString() @MaxLength(1000) customDescription!: string;
  @ApiProperty() @IsBoolean() figmaOnly!: boolean;
  @ApiProperty() @IsString() @MaxLength(2000) comments!: string;
  @ApiProperty({ type: () => ApiResponseStudioTextsDto })
  @ValidateNested()
  @Type(() => ApiResponseStudioTextsDto)
  texts!: ApiResponseStudioTextsDto;
}
export class CreateApiResponseStudioSourceDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @ApiProperty() @IsString() @Matches(/^[a-z][a-z0-9-]{0,99}$/u) slug!: string;
  @ApiProperty()
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true })
  @MaxLength(2000)
  jsonUrl!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true })
  @MaxLength(2000)
  docsUrl?: string;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() enabled?: boolean;
}
export class UpdateApiResponseStudioSourceDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[a-z][a-z0-9-]{0,99}$/u) slug?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true })
  @MaxLength(2000)
  jsonUrl?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true })
  @MaxLength(2000)
  docsUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiProperty() @IsInt() @Min(1) expectedRevision!: number;
}
export class SyncApiResponseStudioSourceDto {
  @ApiProperty() @IsInt() @Min(1) expectedRevision!: number;
}
export class UpdateApiResponseStudioResponseDto extends ApiResponseStudioPresentationDto {
  @ApiProperty() @IsInt() @Min(1) expectedRevision!: number;
}
export class ApiResponseStudioRevisionItemDto {
  @ApiProperty() @IsUUID() id!: string;
  @ApiProperty() @IsInt() @Min(1) expectedRevision!: number;
}
export class ApiResponseStudioPresentationPatchDto {
  @ApiPropertyOptional({ enum: ProblemPresentationDisplays })
  @IsOptional()
  @IsIn(ProblemPresentationDisplays)
  display?: ProblemPresentationDisplay;
  @ApiPropertyOptional({ enum: ProblemPresentationSeverities })
  @IsOptional()
  @IsIn(ProblemPresentationSeverities)
  severity?: ProblemPresentationSeverity;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() support?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) customDescription?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() figmaOnly?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) comments?: string;
  @ApiPropertyOptional({ type: () => ApiResponseStudioTextsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ApiResponseStudioTextsDto)
  texts?: ApiResponseStudioTextsDto;
}

export class BulkApiResponseStudioResponsesDto {
  @ApiProperty({ type: () => ApiResponseStudioRevisionItemDto, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ApiResponseStudioRevisionItemDto)
  items!: ApiResponseStudioRevisionItemDto[];
  @ApiProperty({ type: () => ApiResponseStudioPresentationPatchDto })
  @ValidateNested()
  @Type(() => ApiResponseStudioPresentationPatchDto)
  patch!: ApiResponseStudioPresentationPatchDto;
}
export class DismissApiResponseStudioResponsesDto {
  @ApiProperty({ type: () => ApiResponseStudioRevisionItemDto, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ApiResponseStudioRevisionItemDto)
  items!: ApiResponseStudioRevisionItemDto[];
}
export class ResetApiResponseStudioResponseDto {
  @ApiProperty() @IsInt() @Min(1) expectedRevision!: number;
}
export class ApiResponseStudioResponseQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() sourceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) exact?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(16) status?: string;
  @ApiPropertyOptional({ enum: StudioMethods }) @IsOptional() @IsIn(StudioMethods) method?: string;
  @ApiPropertyOptional({ enum: ProblemPresentationDisplays })
  @IsOptional()
  @IsIn(ProblemPresentationDisplays)
  display?: string;
  @ApiPropertyOptional({ enum: StudioChanges }) @IsOptional() @IsIn(StudioChanges) changeState?: string;
  @ApiPropertyOptional({ enum: ['en', 'ru', 'zh'] }) @IsOptional() @IsIn(['en', 'ru', 'zh']) missingLanguage?:
    'en' | 'ru' | 'zh';
  @ApiPropertyOptional() @IsOptional() @Transform(toBoolean) @IsBoolean() includeDeleted?: boolean;
  @ApiPropertyOptional({ default: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}
export class ApiResponseStudioHistoryQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() sourceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() responseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(128) action?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() actorUserId?: string;
  @ApiPropertyOptional({ default: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}
class ApiResponseStudioSyncSummaryDto {
  @ApiProperty() created!: number;
  @ApiProperty() modified!: number;
  @ApiProperty() deleted!: number;
  @ApiProperty() unchanged!: number;
}
export class ApiResponseStudioSourceViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() jsonUrl!: string;
  @ApiProperty() docsUrl!: string;
  @ApiProperty() enabled!: boolean;
  @ApiProperty() manualOnly!: boolean;
  @ApiProperty() revision!: number;
  @ApiPropertyOptional() lastSyncAt!: Date | null;
  @ApiProperty() lastSyncStatus!: string;
  @ApiProperty() lastSyncError!: string;
  @ApiPropertyOptional({ type: () => ApiResponseStudioSyncSummaryDto })
  lastSyncSummary!: ApiResponseStudioSyncSummaryDto | null;
  @ApiProperty() createdByUserId!: string;
  @ApiProperty() updatedByUserId!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
export class ApiResponseStudioResponseViewDto extends ApiResponseStudioPresentationDto {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() sourceId!: string;
  @ApiProperty() stableKey!: string;
  @ApiProperty() tag!: string;
  @ApiProperty() method!: string;
  @ApiProperty() path!: string;
  @ApiProperty() operationId!: string;
  @ApiProperty() summary!: string;
  @ApiProperty() status!: string;
  @ApiProperty() errorType!: string;
  @ApiProperty() description!: string;
  @ApiProperty() schemaSnapshot!: string;
  @ApiProperty() exampleSnapshot!: string;
  @ApiProperty({ type: Object, isArray: true }) enumChoices!: Array<Record<string, unknown>>;
  @ApiProperty() changeState!: string;
  @ApiProperty() changeDismissed!: boolean;
  @ApiProperty() deleted!: boolean;
  @ApiProperty() sourceFingerprint!: string;
  @ApiProperty() revision!: number;
  @ApiProperty() updatedByUserId!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
export class ApiResponseStudioSourceListDto {
  @ApiProperty({ type: () => ApiResponseStudioSourceViewDto, isArray: true }) items!: ApiResponseStudioSourceViewDto[];
}
export class ApiResponseStudioResponseListDto {
  @ApiProperty({ type: () => ApiResponseStudioResponseViewDto, isArray: true })
  items!: ApiResponseStudioResponseViewDto[];
  @ApiProperty() total!: number;
}
export class ApiResponseStudioDashboardDto {
  @ApiProperty({ type: Object, isArray: true }) sources!: Array<Record<string, unknown>>;
  @ApiProperty({ type: Object }) totals!: Record<string, unknown>;
}
export class ApiResponseStudioHistoryViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiPropertyOptional() sourceId!: string | null;
  @ApiPropertyOptional() responseId!: string | null;
  @ApiProperty() action!: string;
  @ApiProperty() actorUserId!: string;
  @ApiProperty({ type: Object }) before!: Record<string, unknown>;
  @ApiProperty({ type: Object }) after!: Record<string, unknown>;
  @ApiProperty({ type: Object }) metadata!: Record<string, unknown>;
  @ApiProperty() createdAt!: Date;
}
export class ApiResponseStudioHistoryListDto {
  @ApiProperty({ type: () => ApiResponseStudioHistoryViewDto, isArray: true })
  items!: ApiResponseStudioHistoryViewDto[];
}
export class ApiResponseStudioSyncResultDto {
  @ApiProperty({ type: () => ApiResponseStudioSourceViewDto }) source!: ApiResponseStudioSourceViewDto;
  @ApiProperty({ type: () => ApiResponseStudioSyncSummaryDto }) summary!: ApiResponseStudioSyncSummaryDto;
}
export class ApiResponseStudioExportDto {
  @ApiProperty() filename!: string;
  @ApiProperty() mediaType!: string;
  @ApiProperty() content!: string;
}
