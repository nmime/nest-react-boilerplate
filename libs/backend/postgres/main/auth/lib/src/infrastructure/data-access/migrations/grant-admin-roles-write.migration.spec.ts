// @requirements REQ-AUTH-PERSISTENCE-007
import { AdminRolesWritePermission } from '@app/common-authz';
import { describe, expect, it } from 'vitest';
import { Migration20260704120000CreateRbacModel } from './Migration20260704120000CreateRbacModel';
import { Migration20260704130000GrantAdminRolesWrite } from './Migration20260704130000GrantAdminRolesWrite';
import { Migration20260710120000AddAuthUserAvatar } from './Migration20260710120000AddAuthUserAvatar';
import { authMigrations } from './index';

function collectSql(migration: { addSql(sql: string): void }, run: () => void): string {
  const statements: string[] = [];
  migration.addSql = (sql: string) => {
    statements.push(sql);
  };
  run();

  return statements.join('\n');
}

describe('Grant admin roles:write migration', () => {
  it('idempotently grants admin -> admin:roles:write from the shared catalog', () => {
    const migration = new Migration20260704130000GrantAdminRolesWrite(undefined as never, undefined as never);
    const sql = collectSql(migration, () => {
      migration.up();
    });

    expect(sql).toContain('insert into "auth_role_permissions"');
    expect(sql).toContain(`r."key" = 'admin'`);
    expect(sql).toContain(`p."key" = '${AdminRolesWritePermission}'`);
    expect(sql).toContain('on conflict do nothing');
  });

  it('removes exactly the admin -> admin:roles:write grant on rollback', () => {
    const migration = new Migration20260704130000GrantAdminRolesWrite(undefined as never, undefined as never);
    const sql = collectSql(migration, () => {
      migration.down();
    });

    expect(sql).toContain('delete from "auth_role_permissions"');
    expect(sql).toContain(`r."key" = 'admin'`);
    expect(sql).toContain(`p."key" = '${AdminRolesWritePermission}'`);
  });

  it('registers the grant migration before data-model migrations that follow it', () => {
    expect(authMigrations.indexOf(Migration20260704120000CreateRbacModel)).toBeLessThan(
      authMigrations.indexOf(Migration20260704130000GrantAdminRolesWrite),
    );
    expect(authMigrations.indexOf(Migration20260704130000GrantAdminRolesWrite)).toBeLessThan(
      authMigrations.indexOf(Migration20260710120000AddAuthUserAvatar),
    );
  });
});
