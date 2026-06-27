import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { supportedLocales } from "@app/common/i18n";

export class AuthenticatedPrincipalDto {
  @ApiProperty()
  subject!: string;

  @ApiPropertyOptional({ format: "email" })
  email?: string;

  @ApiPropertyOptional()
  displayName?: string;

  @ApiPropertyOptional({ enum: supportedLocales })
  locale?: string;

  @ApiPropertyOptional()
  issuer?: string;

  @ApiPropertyOptional({
    oneOf: [{ type: "string" }, { items: { type: "string" }, type: "array" }],
  })
  audience?: string | string[];

  @ApiProperty({ items: { type: "string" }, type: "array" })
  roles!: string[];

  @ApiProperty({ items: { type: "string" }, type: "array" })
  permissions!: string[];

  @ApiPropertyOptional()
  tokenId?: string;
}

export class UserProfileViewDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ format: "email" })
  email?: string;

  @ApiPropertyOptional()
  displayName?: string;

  @ApiPropertyOptional({ enum: supportedLocales })
  locale?: string;

  @ApiProperty({ items: { type: "string" }, type: "array" })
  roles!: string[];

  @ApiProperty({ items: { type: "string" }, type: "array" })
  permissions!: string[];
}

export class ProfilePayloadDto {
  @ApiProperty({ type: () => AuthenticatedPrincipalDto })
  principal!: AuthenticatedPrincipalDto;

  @ApiProperty({ type: () => UserProfileViewDto })
  profile!: UserProfileViewDto;
}
