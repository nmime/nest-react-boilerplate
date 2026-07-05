import { ApiProperty } from "@nestjs/swagger";
import { AdminAuditLogViewDto } from "./admin-audit-log-view.dto";

export class AdminDashboardSummaryDto {
  @ApiProperty()
  totalUsers!: number;

  @ApiProperty()
  activeUsers!: number;

  @ApiProperty()
  disabledUsers!: number;

  @ApiProperty()
  invitedUsers!: number;

  @ApiProperty()
  recentAuditEvents!: number;

  @ApiProperty({ type: () => AdminAuditLogViewDto, isArray: true })
  recentAudit!: AdminAuditLogViewDto[];
}
