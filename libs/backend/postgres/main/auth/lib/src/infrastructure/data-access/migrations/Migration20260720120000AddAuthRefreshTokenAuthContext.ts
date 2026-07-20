import { Migration } from '@mikro-orm/migrations';

export class Migration20260720120000AddAuthRefreshTokenAuthContext extends Migration {
  override up(): void {
    // Store the authentication context (auth_time, amr, provider, channel) captured
    // when a refresh-token family is first issued, so it can be re-emitted unchanged
    // on rotation instead of resetting auth_time to the refresh time (step-up bypass).
    // NOT NULL with an empty-object default: existing rows predate the context and
    // default to '{}', which is treated as "no context" (step-up fails closed).
    this.addSql(
      `alter table "auth_refresh_tokens" add column if not exists "auth_context" jsonb not null default '{}'::jsonb;`,
    );
  }

  override down(): void {
    this.addSql('alter table "auth_refresh_tokens" drop column if exists "auth_context";');
  }
}
