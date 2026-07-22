import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { supportedLocales } from '@app/backend-common-i18n';

export class AuthenticatedPrincipalDto {
  @ApiProperty()
  subject!: string;

  @ApiPropertyOptional({ format: 'email' })
  email?: string;

  @ApiPropertyOptional()
  displayName?: string;

  @ApiPropertyOptional({ format: 'uri' })
  avatarUrl?: string;

  @ApiPropertyOptional({ enum: supportedLocales })
  locale?: string;

  @ApiProperty({ items: { type: 'string' }, type: 'array' })
  roles!: string[];

  @ApiProperty({ items: { type: 'string' }, type: 'array' })
  permissions!: string[];
}
