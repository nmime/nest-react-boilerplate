import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import {
  ProblemPresentationDisplays,
  ProblemPresentationSeverities,
  type ProblemPresentationDisplay,
  type ProblemPresentationSeverity,
} from '@app/common-problem-details';

const RuleAppPattern = /^(?:admin|auth|user)-app-api:/u;
const RuleMethodPattern = /:(?:GET|PUT|POST|DELETE|PATCH|OPTIONS|HEAD|TRACE):\//u;
const RuleStatusPattern = /:(?:[1-5]\d{2}|default|ERR|NET)(?::[A-Za-z0-9][A-Za-z0-9._-]*)?$/u;
const RuleWhitespacePattern = /^\S+$/u;

export class UpdateAdminProblemPresentationDto {
  @ApiProperty({ maxLength: 512 })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  @Matches(RuleAppPattern)
  @Matches(RuleMethodPattern)
  @Matches(RuleStatusPattern)
  @Matches(RuleWhitespacePattern)
  ruleId!: string;

  @ApiProperty({ enum: ProblemPresentationDisplays })
  @IsIn(ProblemPresentationDisplays)
  display!: ProblemPresentationDisplay;

  @ApiProperty({ enum: ProblemPresentationSeverities })
  @IsIn(ProblemPresentationSeverities)
  severity!: ProblemPresentationSeverity;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  messageEn?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  messageRu?: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  expectedRevision!: number;
}

export class ResetAdminProblemPresentationDto {
  @ApiProperty({ maxLength: 512 })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  @Matches(RuleAppPattern)
  @Matches(RuleMethodPattern)
  @Matches(RuleStatusPattern)
  @Matches(RuleWhitespacePattern)
  ruleId!: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  expectedRevision!: number;
}
