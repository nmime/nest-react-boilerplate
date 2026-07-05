import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsObject, IsOptional, IsString, IsUUID } from "class-validator";
import {
  ExternalAuthIntent,
  externalAuthIntents,
  externalAuthProviders,
  type ExternalAuthProvider,
} from "@app/backend-feature-auth-shared";

export class ExternalAuthIntentDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ enum: externalAuthIntents })
  @IsOptional()
  @IsString()
  @IsIn(externalAuthIntents)
  intent?: ExternalAuthIntent;

  @ApiPropertyOptional({ writeOnly: true })
  @IsOptional()
  @IsString()
  linkToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  returnUrl?: string;
}

export class TelegramWebLoginDto extends ExternalAuthIntentDto {
  @ApiProperty({ type: "object", additionalProperties: true })
  @IsObject()
  payload!: Record<string, string | number | boolean | null | undefined>;
}

export class TelegramTmaDto extends ExternalAuthIntentDto {
  @ApiProperty({ writeOnly: true })
  @IsString()
  initData!: string;
}

export class TelegramBotLinkDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiProperty({ writeOnly: true })
  @IsString()
  linkToken!: string;

  @ApiProperty()
  @IsString()
  providerSubject!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

export class LinkTokenDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiProperty({ enum: externalAuthProviders })
  @IsString()
  @IsIn(externalAuthProviders)
  provider!: ExternalAuthProvider;

  @ApiPropertyOptional({ enum: externalAuthIntents })
  @IsOptional()
  @IsString()
  @IsIn(externalAuthIntents)
  intent?: ExternalAuthIntent;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  returnUrl?: string;
}

export class DiscordAuthorizationRequestDto extends ExternalAuthIntentDto {}

export class DiscordCallbackQueryDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiProperty()
  @IsString()
  code!: string;

  @ApiProperty()
  @IsString()
  state!: string;
}
