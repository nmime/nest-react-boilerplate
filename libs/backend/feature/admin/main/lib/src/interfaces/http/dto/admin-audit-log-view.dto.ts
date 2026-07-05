import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AdminAuditLogViewDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  tenantId!: string;

  @ApiPropertyOptional({ format: "uuid" })
  actorUserId?: string;

  @ApiProperty()
  action!: string;

  @ApiProperty()
  resource!: string;

  @ApiPropertyOptional({ format: "uuid" })
  targetUserId?: string;

  @ApiProperty({ additionalProperties: true, type: "object" })
  before!: Record<string, unknown>;

  @ApiProperty({ additionalProperties: true, type: "object" })
  after!: Record<string, unknown>;

  @ApiProperty({ additionalProperties: true, type: "object" })
  metadata!: Record<string, unknown>;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;
}
