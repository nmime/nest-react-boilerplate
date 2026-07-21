import { Migration } from '@mikro-orm/migrations';

export class Migration20260721170000AddAdminAuditFilterIndexes extends Migration {
  override up(): void {
    this.addSql(
      'create index if not exists "ix__admin_audit_logs__tenant_id_resource_created_at" on "admin_audit_logs" ("tenant_id", "resource", "created_at");',
    );
    this.addSql(
      'create index if not exists "ix__admin_audit_logs__tenant_id_actor_user_id_created_at" on "admin_audit_logs" ("tenant_id", "actor_user_id", "created_at");',
    );
  }

  override down(): void {
    this.addSql('drop index if exists "ix__admin_audit_logs__tenant_id_actor_user_id_created_at";');
    this.addSql('drop index if exists "ix__admin_audit_logs__tenant_id_resource_created_at";');
  }
}
