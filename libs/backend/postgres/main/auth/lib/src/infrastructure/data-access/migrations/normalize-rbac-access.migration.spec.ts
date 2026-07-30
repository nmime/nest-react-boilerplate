// @requirements REQ-AUTH-PERSISTENCE-007
import {
  AdminNotificationBroadcastsApprovePermission,
  AdminNotificationBroadcastsSendPermission,
  AdminNotificationTemplatesTestPermission,
  AdminRole,
} from '@app/common-authz';
import { describe, expect, it } from 'vitest';
import { Migration20260721201000GrantAuthLoginAnalyticsRead } from './Migration20260721201000GrantAuthLoginAnalyticsRead';
import { Migration20260721210000NormalizeRbacAccess } from './Migration20260721210000NormalizeRbacAccess';
import { authMigrations } from './index';

const collectSql = (migration: { addSql(sql: string): void }, run: () => void): string => {
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  run();
  return statements.join('\n');
};

describe('Normalize RBAC access migration', () => {
  it('adds normalized direct user grants with tenant and foreign-key constraints', () => {
    const migration = new Migration20260721210000NormalizeRbacAccess(undefined as never, undefined as never);
    const sql = collectSql(migration, () => {
      migration.up();
    });

    expect(sql).toContain('create table if not exists "auth_user_permissions"');
    expect(sql).toContain('constraint "pk__auth_user_permissions" primary key ("auth_user_id", "permission_id")');
    expect(sql).toContain(
      'constraint "fk__auth_user_permissions__auth_user_id_tenant_id" foreign key ("auth_user_id", "tenant_id") references "auth_users" ("id", "tenant_id") on delete cascade',
    );
    expect(sql).toContain(
      'constraint "fk__auth_user_permissions__permission_id" foreign key ("permission_id") references "auth_permissions" ("id") on delete cascade',
    );
    expect(sql).toContain(
      'constraint "fk__auth_user_permissions__tenant_id" foreign key ("tenant_id") references "auth_tenants" ("id") on delete cascade',
    );
    expect(sql).toContain('ix__auth_user_permissions__permission_id');
    expect(sql).toContain('ix__auth_user_permissions__tenant_id');
    expect(sql).toContain('uq__auth_users__id_tenant_id');
    expect(sql).toContain('uq__auth_roles__id_tenant_id');
    expect(sql).toContain('fk__auth_user_roles__auth_user_id_tenant_id');
    expect(sql).toContain('fk__auth_user_roles__role_id_tenant_id');
  });

  it('repairs every tenant’s catalog, system roles, notification grants, and legacy access without duplicate rows', () => {
    const migration = new Migration20260721210000NormalizeRbacAccess(undefined as never, undefined as never);
    const sql = collectSql(migration, () => {
      migration.up();
    });

    expect(sql).toContain('insert into "auth_permissions"');
    expect(sql).toContain('on conflict ("key") do update');
    expect(sql).toContain('select "id" as "tenant_id" from "auth_tenants"');
    expect(sql).toContain(
      'select distinct "tenant_id" from "auth_users" union select distinct "tenant_id" from "auth_roles"',
    );
    expect(sql).toContain(`r."key" = '${AdminRole}'`);
    expect(sql).toContain('where r."is_system" = true');
    expect(sql).toContain('cross join "auth_permissions" p');
    expect(sql).toContain(AdminNotificationTemplatesTestPermission);
    expect(sql).toContain(AdminNotificationBroadcastsSendPermission);
    expect(sql).toContain(AdminNotificationBroadcastsApprovePermission);
    expect(sql).toContain('insert into "auth_user_roles"');
    expect(sql).toContain('jsonb_array_elements_text(coalesce(u."roles"');
    expect(sql).toContain('insert into "auth_user_permissions"');
    expect(sql).toContain('not exists (select 1 from "auth_user_roles" ur');
    expect(sql).toContain('on conflict do nothing');
  });

  it('removes only the owned direct-grant table and introduced notification grants on rollback', () => {
    const migration = new Migration20260721210000NormalizeRbacAccess(undefined as never, undefined as never);
    const sql = collectSql(migration, () => {
      migration.down();
    });

    expect(sql).toContain('drop table if exists "auth_user_permissions" cascade');
    expect(sql).toContain('drop constraint if exists "fk__auth_user_roles__auth_user_id_tenant_id"');
    expect(sql).toContain('drop constraint if exists "fk__auth_user_roles__role_id_tenant_id"');
    expect(sql).toContain('delete from "auth_role_permissions"');
    expect(sql).toContain('delete from "auth_permissions"');
    expect(sql).toContain(AdminNotificationTemplatesTestPermission);
  });

  it('runs after the previous RBAC and analytics grants', () => {
    expect(authMigrations.indexOf(Migration20260721201000GrantAuthLoginAnalyticsRead)).toBeLessThan(
      authMigrations.indexOf(Migration20260721210000NormalizeRbacAccess),
    );
  });
});
