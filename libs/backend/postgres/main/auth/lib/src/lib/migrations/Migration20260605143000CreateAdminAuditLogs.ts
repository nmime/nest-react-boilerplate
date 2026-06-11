import { Migration } from "@mikro-orm/migrations";

export class Migration20260605143000CreateAdminAuditLogs extends Migration {
  override up(): void {
    this.addSql(
      'create table if not exists "admin_audit_logs" ("id" uuid not null, "tenant_id" uuid not null default \'00000000-0000-0000-0000-000000000000\', "actor_user_id" uuid null, "action" varchar(128) not null, "resource" varchar(128) not null, "target_user_id" uuid null, "before" jsonb not null default \'{}\'::jsonb, "after" jsonb not null default \'{}\'::jsonb, "metadata" jsonb not null default \'{}\'::jsonb, "created_at" timestamptz not null, constraint "admin_audit_logs_pkey" primary key ("id"));',
    );
    this.addSql(
      'create index if not exists "ix__admin_audit_logs__tenant_id_created_at" on "admin_audit_logs" ("tenant_id", "created_at");',
    );
    this.addSql(
      'create index if not exists "ix__admin_audit_logs__tenant_id_action" on "admin_audit_logs" ("tenant_id", "action");',
    );
    this.addSql(
      'create index if not exists "ix__admin_audit_logs__tenant_id_target_user_id" on "admin_audit_logs" ("tenant_id", "target_user_id");',
    );
  }

  override down(): void {
    this.addSql(
      'drop index if exists "ix__admin_audit_logs__tenant_id_target_user_id";',
    );
    this.addSql(
      'drop index if exists "ix__admin_audit_logs__tenant_id_action";',
    );
    this.addSql(
      'drop index if exists "ix__admin_audit_logs__tenant_id_created_at";',
    );
    this.addSql('drop table if exists "admin_audit_logs";');
  }
}
