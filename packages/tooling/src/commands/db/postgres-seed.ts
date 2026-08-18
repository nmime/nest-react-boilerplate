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

export interface RbacKeyRow {
  id: string;
  key: string;
}

export interface ResolvedRbacIds {
  roles: Record<string, string>;
  permissions: Record<string, string>;
}

/**
 * Resolves the ids the seed must target for the expected roles/permissions.
 * The auth RBAC migration assigns gen_random_uuid() ids, so a freshly migrated
 * database does not contain the canonical seed-data UUIDs: records the
 * database already has are reused by key, and records that are still missing
 * fall back to the canonical seed-data UUIDs that the seed's inserts use.
 */
export function resolveRbacIds(
  existingRoleRows: readonly RbacKeyRow[],
  existingPermissionRows: readonly RbacKeyRow[],
  expectedRoles: readonly { readonly key: string }[],
  expectedPermissions: readonly { readonly key: string }[],
): ResolvedRbacIds {
  const keyToId = (rows: readonly RbacKeyRow[]): Record<string, string> => {
    const map: Record<string, string> = {};
    for (const row of rows) {
      if (row.key) map[row.key] = row.id;
    }
    return map;
  };
  const resolve = (
    existing: Record<string, string>,
    canonical: Record<string, string>,
    expected: readonly { readonly key: string }[],
  ): Record<string, string> => {
    const resolved: Record<string, string> = {};
    for (const item of expected) {
      const id = existing[item.key] ?? canonical[item.key];
      if (id) resolved[item.key] = id;
    }
    return resolved;
  };
  return {
    roles: resolve(keyToId(existingRoleRows), roleUuids, expectedRoles),
    permissions: resolve(keyToId(existingPermissionRows), permissionUuids, expectedPermissions),
  };
}

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

export async function seed(client: pg.Client, seedUsers: SeedUser[]): Promise<Record<string, number>> {
  await client.query('BEGIN');
  const counts = { permissions: 0, roles: 0, rolePermissions: 0, users: 0, userRoles: 0 };
  try {
    const existingRoles = await client.query(
      `SELECT "id"::text AS id, "key" FROM "auth_roles" WHERE "tenant_id" = $1`,
      [DefaultTenantId],
    );
    const existingPermissions = await client.query(
      `SELECT "id"::text AS id, "key" FROM "auth_permissions"`,
    );
    const resolved = resolveRbacIds(
      existingRoles.rows as RbacKeyRow[],
      existingPermissions.rows as RbacKeyRow[],
      roles,
      permissions,
    );
    for (const permission of permissions) {
      const uuid = resolved.permissions[permission.key];
      if (!uuid) continue;
      const { rowCount } = await client.query(
        `INSERT INTO "auth_permissions" ("id", "key", "resource", "action", "description", "created_at")
         VALUES ($1, $2, $3, $4, $5, now()) ON CONFLICT ("key") DO NOTHING`,
        [uuid, permission.key, permission.resource, permission.action, permission.description],
      );
      if (rowCount) counts.permissions += rowCount;
    }
    for (const role of roles) {
      const uuid = resolved.roles[role.key];
      if (!uuid) continue;
      const { rowCount } = await client.query(
        `INSERT INTO "auth_roles" ("id", "tenant_id", "key", "label", "description", "is_system", "created_at", "updated_at")
         VALUES ($1, $2, $3, $4, $5, true, now(), now()) ON CONFLICT ("tenant_id", "key") DO NOTHING`,
        [uuid, DefaultTenantId, role.key, role.label, role.description],
      );
      if (rowCount) counts.roles += rowCount;
    }
    for (const role of roles) {
      const roleUuid = resolved.roles[role.key];
      if (!roleUuid) continue;
      for (const permissionKey of rolePermissions[role.key] ?? []) {
        const permissionUuid = resolved.permissions[permissionKey];
        if (!permissionUuid) continue;
        const { rowCount } = await client.query(
          `INSERT INTO "auth_role_permissions" ("role_id", "permission_id", "created_at")
           VALUES ($1, $2, now()) ON CONFLICT DO NOTHING`,
          [roleUuid, permissionUuid],
        );
        if (rowCount) counts.rolePermissions += rowCount;
      }
    }
    const resolvedUserIds: Record<string, string> = {};
    for (const user of seedUsers) {
      // The RBAC jsonb columns ("roles", "permissions") were removed from
      // auth_users; grants are table-driven through auth_user_roles below.
      const { rowCount } = await client.query(
        `INSERT INTO "auth_users" (
           "id", "tenant_id", "email", "display_name", "password_hash", "status",
           "locale", "theme", "last_login_at", "avatar_url", "avatar_hash", "avatar_status", "created_at", "updated_at"
         ) VALUES ($1, $2, $3, $4, $5, 'active', $6, $7,
           'epoch'::timestamptz, '', '', 'none', now(), now())
         ON CONFLICT ("tenant_id", (lower("email"::text))) WHERE "email" IS NOT NULL DO NOTHING`,
        [
          user.id,
          DefaultTenantId,
          user.email,
          user.displayName,
          hashPassword(user.password),
          user.locale,
          user.theme,
        ],
      );
      if (rowCount) counts.users += rowCount;
      const match = await client.query(
        `SELECT "id"::text AS id FROM "auth_users" WHERE "tenant_id" = $1 AND lower("email") = lower($2)`,
        [DefaultTenantId, user.email],
      );
      const userId = match.rows[0]?.id as string | undefined;
      if (!userId) throw new Error(`Could not resolve id for seeded user ${user.email}`);
      resolvedUserIds[user.email] = userId;
    }
    for (const user of seedUsers) {
      const userId = resolvedUserIds[user.email];
      const roleUuid = resolved.roles[user.role];
      if (!roleUuid) continue;
      const { rowCount } = await client.query(
        `INSERT INTO "auth_user_roles" ("auth_user_id", "role_id", "tenant_id", "created_at")
         VALUES ($1, $2, $3, now()) ON CONFLICT DO NOTHING`,
        [userId, roleUuid, DefaultTenantId],
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
