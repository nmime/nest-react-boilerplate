import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ProblemPresentationDisplays,
  ProblemPresentationSeverities,
  type ProblemPresentationDisplay,
  type ProblemPresentationSeverity,
} from '@app/common-problem-details';

export class AdminProblemPresentationViewDto {
  @ApiProperty()
  ruleId!: string;

  @ApiProperty({ enum: ProblemPresentationDisplays })
  display!: ProblemPresentationDisplay;

  @ApiProperty({ enum: ProblemPresentationSeverities })
  severity!: ProblemPresentationSeverity;

  @ApiProperty()
  comment!: string;

  @ApiProperty()
  messageEn!: string;

  @ApiProperty()
  messageRu!: string;

  @ApiProperty()
  revision!: number;

  @ApiPropertyOptional()
  updatedAt?: string;
}

export class AdminProblemPresentationCatalogDto {
  @ApiProperty({ type: () => AdminProblemPresentationViewDto, isArray: true })
  items!: AdminProblemPresentationViewDto[];
}

export class ResetAdminProblemPresentationResultDto {
  @ApiProperty()
  ruleId!: string;
}
