import { pbkdf2Sync, randomBytes } from 'node:crypto';
import pg from 'pg';

import {
  DefaultTenantId,
  permissionUuids,
  permissions,
  rolePermissions,
  roleUuids,
  roles,
  type SeedUser,
} from './seed-data.ts';

export * from './postgres-environment.ts';

export async function seedPostgresDatabase(
  connectionString: string,
  seedUsers: SeedUser[],
): Promise<Record<string, number>> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const tableCheck = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN ('auth_users', 'auth_roles', 'auth_permissions', 'auth_role_permissions', 'auth_user_roles')
       ORDER BY table_name`,
    );
    const found = new Set(tableCheck.rows.map((row) => row.table_name as string));
    const required = ['auth_users', 'auth_roles', 'auth_permissions', 'auth_role_permissions', 'auth_user_roles'];
    const missing = required.filter((table) => !found.has(table));
    if (missing.length > 0) throw new Error(`Missing tables: ${missing.join(', ')}. Run migrations first (pnpm db:migrate).`);
    return await seed(client, seedUsers);
  } finally {
    await client.end();
  }
}

async function seed(client: pg.Client, seedUsers: SeedUser[]): Promise<Record<string, number>> {
  await client.query('BEGIN');
  const counts = { permissions: 0, roles: 0, rolePermissions: 0, users: 0, userRoles: 0 };
  try {
    for (const permission of permissions) {
      const uuid = permissionUuids[permission.key];
      if (!uuid) continue;
      const { rowCount } = await client.query(
        `INSERT INTO "auth_permissions" ("id", "key", "resource", "action", "description", "created_at")
         VALUES ($1, $2, $3, $4, $5, now()) ON CONFLICT ("key") DO NOTHING`,
        [uuid, permission.key, permission.resource, permission.action, permission.description],
      );
      if (rowCount) counts.permissions += rowCount;
    }
    for (const role of roles) {
      const uuid = roleUuids[role.key];
      if (!uuid) continue;
      const { rowCount } = await client.query(
        `INSERT INTO "auth_roles" ("id", "tenant_id", "key", "label", "description", "is_system", "created_at", "updated_at")
         VALUES ($1, $2, $3, $4, $5, true, now(), now()) ON CONFLICT ("tenant_id", "key") DO NOTHING`,
        [uuid, DefaultTenantId, role.key, role.label, role.description],
      );
      if (rowCount) counts.roles += rowCount;
    }
    for (const role of roles) {
      const roleUuid = roleUuids[role.key];
      if (!roleUuid) continue;
      for (const permissionKey of rolePermissions[role.key] ?? []) {
        const permissionUuid = permissionUuids[permissionKey];
        if (!permissionUuid) continue;
        const { rowCount } = await client.query(
          `INSERT INTO "auth_role_permissions" ("role_id", "permission_id", "created_at")
           VALUES ($1, $2, now()) ON CONFLICT DO NOTHING`,
          [roleUuid, permissionUuid],
        );
        if (rowCount) counts.rolePermissions += rowCount;
      }
    }
    for (const user of seedUsers) {
      const userRoleKeys = [user.role];
      const permissionKeys = userRoleKeys.flatMap((role) => rolePermissions[role] ?? []);
      const { rowCount } = await client.query(
        `INSERT INTO "auth_users" (
           "id", "tenant_id", "email", "display_name", "password_hash", "status", "roles", "permissions",
           "locale", "theme", "last_login_at", "avatar_url", "avatar_hash", "avatar_status", "created_at", "updated_at"
         ) VALUES ($1, $2, $3, $4, $5, 'active', $6::jsonb, $7::jsonb, $8, $9,
           'epoch'::timestamptz, '', '', 'none', now(), now()) ON CONFLICT DO NOTHING`,
        [
          user.id,
          DefaultTenantId,
          user.email,
          user.displayName,
          hashPassword(user.password),
          JSON.stringify(userRoleKeys),
          JSON.stringify(permissionKeys),
          user.locale,
          user.theme,
        ],
      );
      if (rowCount) counts.users += rowCount;
    }
    for (const user of seedUsers) {
      const roleUuid = roleUuids[user.role];
      if (!roleUuid) continue;
      const { rowCount } = await client.query(
        `INSERT INTO "auth_user_roles" ("auth_user_id", "role_id", "tenant_id", "created_at")
         VALUES ($1, $2, $3, now()) ON CONFLICT DO NOTHING`,
        [user.id, roleUuid, DefaultTenantId],
      );
      if (rowCount) counts.userRoles += rowCount;
    }
    await client.query('COMMIT');
    return counts;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('base64url');
  const digest = pbkdf2Sync(password, salt, 120_000, 32, 'sha256').toString('base64url');
  return `pbkdf2_sha256$120000$${salt}$${digest}`;
}
