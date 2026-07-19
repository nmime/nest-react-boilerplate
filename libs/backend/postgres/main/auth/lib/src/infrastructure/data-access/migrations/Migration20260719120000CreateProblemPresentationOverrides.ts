import type { Transaction } from '@mikro-orm/core';
import { Migration } from '@mikro-orm/migrations';

export class Migration20260719120000CreateProblemPresentationOverrides extends Migration {
  override isTransactional(): boolean {
    return super.isTransactional();
  }

  override reset(): void {
    super.reset();
  }

  override setTransactionContext(ctx: Transaction): void {
    super.setTransactionContext(ctx);
  }

  override up(): void {
    this.addSql(`
      create table "problem_presentation_overrides" (
        "id" uuid not null,
        "tenant_id" uuid not null,
        "rule_id" varchar(512) not null,
        "display" varchar(16) not null,
        "severity" varchar(16) not null,
        "comment" text not null default '',
        "message_en" text not null default '',
        "message_ru" text not null default '',
        "revision" integer not null default 1,
        "updated_by_user_id" uuid not null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "pk__problem_presentation_overrides" primary key ("id"),
        constraint "uq__problem_presentation_overrides__tenant_id_rule_id" unique ("tenant_id", "rule_id"),
        constraint "fk__problem_presentation_overrides__tenant_id" foreign key ("tenant_id") references "auth_tenants" ("id") on update cascade on delete cascade,
        constraint "fk__problem_presentation_overrides__updated_by_user_id" foreign key ("updated_by_user_id") references "auth_users" ("id") on update cascade on delete restrict,
        constraint "ck__problem_presentation_overrides__rule_id" check ("rule_id" ~ '^(admin|auth|user)-app-api:(GET|PUT|POST|DELETE|PATCH|OPTIONS|HEAD|TRACE):/[^[:space:]]+:(default|ERR|NET|[1-5][0-9]{2})(:[A-Za-z0-9][A-Za-z0-9._-]*)?$'),
        constraint "ck__problem_presentation_overrides__display" check ("display" in ('toast', 'silent')),
        constraint "ck__problem_presentation_overrides__severity" check ("severity" in ('error', 'warning', 'info', 'success')),
        constraint "ck__problem_presentation_overrides__revision" check ("revision" >= 1)
      );
    `);
    this.addSql(
      'create index "ix__problem_presentation_overrides__tenant_id" on "problem_presentation_overrides" ("tenant_id");',
    );
  }

  override down(): void {
    this.addSql('drop table if exists "problem_presentation_overrides" cascade;');
  }
}
