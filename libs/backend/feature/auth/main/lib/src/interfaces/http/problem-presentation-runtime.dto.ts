import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ProblemPresentationDisplays,
  ProblemPresentationSeverities,
  type ProblemPresentationDisplay,
  type ProblemPresentationSeverity,
} from '@app/common-problem-details';

export class ProblemPresentationRuntimeViewDto {
  @ApiProperty()
  ruleId!: string;

  @ApiProperty({ enum: ProblemPresentationDisplays })
  display!: ProblemPresentationDisplay;

  @ApiProperty({ enum: ProblemPresentationSeverities })
  severity!: ProblemPresentationSeverity;

  @ApiPropertyOptional()
  messageEn?: string;

  @ApiPropertyOptional()
  messageRu?: string;

  @ApiPropertyOptional()
  messageZh?: string;

  @ApiPropertyOptional({ type: Object })
  texts?: { en?: readonly string[]; ru?: readonly string[]; zh?: readonly string[] };

  @ApiPropertyOptional()
  customDescription?: string;

  @ApiPropertyOptional()
  support?: boolean;

  @ApiPropertyOptional()
  figmaOnly?: boolean;

  @ApiProperty()
  revision!: number;

  @ApiPropertyOptional()
  updatedAt?: string;

  @ApiPropertyOptional()
  updatedByUserId?: string;
}

export class ProblemPresentationRuntimePayloadDto {
  @ApiProperty({ type: () => ProblemPresentationRuntimeViewDto, isArray: true })
  items!: ProblemPresentationRuntimeViewDto[];
}
