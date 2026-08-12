// @requirements REQ-AUTH-PERSISTENCE-007
import { defaultRolePermissions, permissionCatalog, roleKeys } from '@app/common-authz';
import { describe, expect, it } from 'vitest';
import { Migration20260614120000CreateSocialAuthDataModel } from './Migration20260614120000CreateSocialAuthDataModel';
import { Migration20260704120000CreateRbacModel } from './Migration20260704120000CreateRbacModel';
import { authMigrations } from './index';

function collectSql(migration: { addSql(sql: string): void }, run: () => void): string {
  const statements: string[] = [];
  migration.addSql = (sql: string) => {
    statements.push(sql);
  };
  run();

  return statements.join('\n');
}

describe('RBAC model migration', () => {
  it('creates the four normalized RBAC tables with deterministic constraints', () => {
    const migration = new Migration20260704120000CreateRbacModel(undefined as never, undefined as never);
    const sql = collectSql(migration, () => {
      migration.up();
    });

    expect(sql).toContain('create table if not exists "auth_roles"');
    expect(sql).toContain('constraint "uq__auth_roles__tenant_id_key"');
    expect(sql).toContain('create table if not exists "auth_permissions"');
    expect(sql).toContain('constraint "uq__auth_permissions__key"');
    expect(sql).toContain('create table if not exists "auth_role_permissions"');
    expect(sql).toContain('constraint "pk__auth_role_permissions" primary key ("role_id", "permission_id")');
    expect(sql).toContain(
      'constraint "fk__auth_role_permissions__role_id" foreign key ("role_id") references "auth_roles" ("id") on delete cascade',
    );
    expect(sql).toContain(
      'constraint "fk__auth_role_permissions__permission_id" foreign key ("permission_id") references "auth_permissions" ("id") on delete cascade',
    );
    expect(sql).toContain('create table if not exists "auth_user_roles"');
    expect(sql).toContain('constraint "pk__auth_user_roles" primary key ("auth_user_id", "role_id")');
    expect(sql).toContain(
      'constraint "fk__auth_user_roles__auth_user_id" foreign key ("auth_user_id") references "auth_users" ("id") on delete cascade',
    );
    expect(sql).toContain('"granted_by_user_id" uuid null');
  });

  it('seeds the permission catalog and system roles from @app/common-authz', () => {
    const migration = new Migration20260704120000CreateRbacModel(undefined as never, undefined as never);
    const sql = collectSql(migration, () => {
      migration.up();
    });

    expect(sql).toContain('insert into "auth_permissions"');
    for (const permission of permissionCatalog) {
      expect(sql).toContain(`'${permission.key}'`);
    }
    // Descriptions with apostrophes must be doubled to remain valid SQL.
    expect(sql).toContain("Read the signed-in user''s own profile.");

    expect(sql).toContain('insert into "auth_roles"');
    for (const key of roleKeys) {
      expect(sql).toContain(`'${key}'`);
    }
    expect(sql).toContain('true, now(), now()');
  });

  it('seeds role grants from the default matrix and backfills user roles', () => {
    const migration = new Migration20260704120000CreateRbacModel(undefined as never, undefined as never);
    const sql = collectSql(migration, () => {
      migration.up();
    });

    // Walked as entries rather than indexed by role key: the catalog is open to product roles, so
    // the matrix is keyed by plain strings and indexing it would only prove the seed covers the
    // roles this test happened to name.
    for (const [key, permissions] of Object.entries(defaultRolePermissions)) {
      expect(roleKeys).toContain(key);
      expect(sql).toContain(`insert into "auth_role_permissions" ("role_id", "permission_id", "created_at")`);
      for (const permissionKey of permissions) {
        expect(sql).toContain(`'${permissionKey}'`);
      }
    }
    expect(sql).toContain('insert into "auth_user_roles"');
    expect(sql).toContain('jsonb_array_elements_text');
    expect(sql).toContain('on conflict do nothing');
  });

  it('drops every RBAC table in reverse dependency order on rollback', () => {
    const migration = new Migration20260704120000CreateRbacModel(undefined as never, undefined as never);
    const sql = collectSql(migration, () => {
      migration.down();
    });

    const dropped = sql
      .split('\n')
      .map((line) => /drop table if exists "([a-z_]+)"/.exec(line)?.[1])
      .filter((name): name is string => Boolean(name));

    expect(dropped).toEqual(['auth_user_roles', 'auth_role_permissions', 'auth_permissions', 'auth_roles']);
  });

  it('registers the RBAC model migration after the social auth migration', () => {
    expect(authMigrations).toContain(Migration20260704120000CreateRbacModel);
    expect(authMigrations.indexOf(Migration20260614120000CreateSocialAuthDataModel)).toBeLessThan(
      authMigrations.indexOf(Migration20260704120000CreateRbacModel),
    );
  });
});
