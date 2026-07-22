import type { EntityManager } from '@mikro-orm/core';
import { DefaultAuthTenantId, type AuthUserEntity } from '../../entities';
import {
  AdminUsersAccessPolicyUpdatePermissionName,
  AdminUsersWritePermissionName,
} from '../const/admin-user-mutation.const';

export function hasActivePowerfulAdminAccess(
  entity: Pick<AuthUserEntity, 'status' | 'roles' | 'permissions'>,
): boolean {
  return (
    entity.status === 'active' &&
    entity.permissions.includes(AdminUsersWritePermissionName) &&
    entity.permissions.includes(AdminUsersAccessPolicyUpdatePermissionName)
  );
}

export async function countActivePowerfulAdmins(
  entityManager: EntityManager,
  tenantId: string = DefaultAuthTenantId,
): Promise<number> {
  const rows = (await entityManager
    .getConnection()
    .execute(
      countActivePowerfulAdminsSql,
      [tenantId, AdminUsersWritePermissionName, AdminUsersAccessPolicyUpdatePermissionName],
      'all',
    )) as Array<{ active_powerful_admin_count: number | string }>;
  return Number(rows[0]?.active_powerful_admin_count ?? 0);
}

// Safety-critical counts resolve only normalized role/direct grants.
const countActivePowerfulAdminsSql =
  `select count(*)::int as active_powerful_admin_count from "auth_users" u ` +
  `where u."tenant_id" = ? and u."status" = 'active' and ` +
  `(select count(distinct effective_permissions.permission_key) from (` +
  `select p."key" as permission_key from "auth_user_permissions" up ` +
  `inner join "auth_permissions" p on p."id" = up."permission_id" ` +
  `where up."auth_user_id" = u."id" and up."tenant_id" = u."tenant_id" ` +
  `union ` +
  `select p."key" as permission_key from "auth_user_roles" ur ` +
  `inner join "auth_roles" r on r."id" = ur."role_id" and r."tenant_id" = ur."tenant_id" ` +
  `inner join "auth_role_permissions" rp on rp."role_id" = ur."role_id" ` +
  `inner join "auth_permissions" p on p."id" = rp."permission_id" ` +
  `where ur."auth_user_id" = u."id" and ur."tenant_id" = u."tenant_id"` +
  `) effective_permissions where effective_permissions.permission_key in (?, ?)) = 2;`;
