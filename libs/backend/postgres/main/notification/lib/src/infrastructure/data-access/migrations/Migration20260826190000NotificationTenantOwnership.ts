import { Migration } from '@mikro-orm/migrations';

const UnresolvedTenantId = 'ffffffff-ffff-4fff-bfff-ffffffffffff';

/** Makes the tenant that owns an ordinary notification durable and queryable. */
export class Migration20260826190000NotificationTenantOwnership extends Migration {
  override up(): void {
    this.addSql(`
      alter table "notifications" add column if not exists "tenant_id" uuid not null default '${UnresolvedTenantId}'::uuid;
      update "notifications" n
        set "tenant_id" = b."tenant_id"
        from "notification_broadcasts" b
        where b."id" = n."broadcast_id";
      do $$
      begin
        if exists (
          select 1 from "notifications" n
          where n."tenant_id" = '${UnresolvedTenantId}'::uuid
        ) then
          raise exception 'cannot infer tenant ownership for legacy ordinary notifications; resolve notifications.tenant_id before re-running';
        end if;
      end $$;
      alter table "notifications" alter column "tenant_id" set not null;
      alter table "notifications" alter column "tenant_id" drop default;
      alter table "notification_templates" drop constraint if exists "ck__notification_templates__tenant";
      alter table "notification_templates" drop constraint if exists "uq__notification_templates__code";
      drop index if exists "uq__notification_templates__code";
      create unique index if not exists "uq__notification_templates__code"
        on "notification_templates" ("code") where "tenant_id" is null;
      create unique index if not exists "uq__notification_templates__tenant_id_code"
        on "notification_templates" ("tenant_id", "code") where "tenant_id" is not null;
      create index if not exists "ix__notifications__tenant_id_created_at_desc"
        on "notifications" ("tenant_id", "created_at" desc);
    `);
  }

  override down(): void {
    // Tenant-owned code templates cannot be represented by the predecessor schema, and collapsing
    // duplicate tenant/shared codes is a destructive policy decision. Refuse an unsafe rollback
    // before dropping any ownership metadata instead of failing midway through schema restoration.
    this.addSql(`
      do $$
      begin
        if exists (
          select 1 from "notification_templates"
          where "source" = 'code' and "tenant_id" is not null
        ) or exists (
          select 1 from "notification_templates"
          group by "code" having count(*) > 1
        ) then
          raise exception 'cannot roll back notification tenant ownership while tenant-owned or duplicate-code templates exist';
        end if;
      end $$;
    `);
    this.addSql('drop index if exists "ix__notifications__tenant_id_created_at_desc";');
    this.addSql('drop index if exists "uq__notification_templates__tenant_id_code";');
    this.addSql('drop index if exists "uq__notification_templates__code";');
    this.addSql(
      'alter table "notification_templates" add constraint "uq__notification_templates__code" unique ("code");',
    );
    this.addSql(`
      alter table "notification_templates" add constraint "ck__notification_templates__tenant"
        check (("source" = 'code' and "tenant_id" is null) or ("source" = 'admin' and "tenant_id" is not null));
    `);
    this.addSql('alter table "notifications" drop column if exists "tenant_id";');
  }
}
