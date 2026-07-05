export const listRoleKeysSql =
  `select distinct r."key" as role_key ` +
  `from "auth_user_roles" ur ` +
  `inner join "auth_roles" r on r."id" = ur."role_id" ` +
  `where ur."auth_user_id" = ? and ur."tenant_id" = ?`;

export const resolveEffectiveAccessSql =
  `select r."key" as role_key, p."key" as permission_key ` +
  `from "auth_user_roles" ur ` +
  `inner join "auth_roles" r on r."id" = ur."role_id" ` +
  `left join "auth_role_permissions" rp on rp."role_id" = ur."role_id" ` +
  `left join "auth_permissions" p on p."id" = rp."permission_id" ` +
  `where ur."auth_user_id" = ? and ur."tenant_id" = ?`;
