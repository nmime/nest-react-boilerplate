import { Migration } from "@mikro-orm/migrations";

export class Migration20260601130000AddAuthTokenExpiryIndexes extends Migration {
  override up(): void {
    this.addSql(
      'create index if not exists "ix__auth_refresh_tokens__expires_at" on "auth_refresh_tokens" ("expires_at");',
    );
    this.addSql(
      'create index if not exists "ix__auth_user_tokens__expires_at" on "auth_user_tokens" ("expires_at");',
    );
  }

  override down(): void {
    this.addSql('drop index if exists "ix__auth_user_tokens__expires_at";');
    this.addSql('drop index if exists "ix__auth_refresh_tokens__expires_at";');
  }
}
