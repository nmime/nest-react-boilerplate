import { ApiProperty } from '@nestjs/swagger';
import { AdminRbacPermissionDto } from './admin-rbac-permission.dto';
import { AdminRbacRoleDto } from './admin-rbac-role.dto';

export class AdminRbacCatalogPayloadDto {
  @ApiProperty({ items: { type: 'string' }, type: 'array' })
  resources!: string[];

  @ApiProperty({ type: () => AdminRbacRoleDto, isArray: true })
  roles!: AdminRbacRoleDto[];

  @ApiProperty({ type: () => AdminRbacPermissionDto, isArray: true })
  permissions!: AdminRbacPermissionDto[];

  @ApiProperty({ items: { type: 'string' }, type: 'array' })
  assignableRoles!: string[];

  @ApiProperty({ items: { type: 'string' }, type: 'array' })
  assignablePermissions!: string[];
}
