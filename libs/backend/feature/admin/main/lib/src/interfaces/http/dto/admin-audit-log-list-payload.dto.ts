import { ApiProperty } from '@nestjs/swagger';
import { AdminAuditLogViewDto } from './admin-audit-log-view.dto';

export class AdminAuditLogListPayloadDto {
  @ApiProperty({ type: () => AdminAuditLogViewDto, isArray: true })
  items!: AdminAuditLogViewDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  offset!: number;
}
