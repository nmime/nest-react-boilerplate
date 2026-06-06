import { Migration } from "@mikro-orm/migrations";

export class Migration20260606120000AlignAuthUserLocaleConstraint extends Migration {
  override up(): void {
    this.addSql(`
      alter table "auth_users" drop constraint if exists "auth_users_locale_check";
      alter table "auth_users" drop constraint if exists "ck__auth_users__locale";
      alter table "auth_users"
        add constraint "ck__auth_users__locale"
        check ("locale" in ('en', 'ru'));
    `);
  }

  override down(): void {
    this.addSql(`
      alter table "auth_users" drop constraint if exists "ck__auth_users__locale";
      alter table "auth_users"
        add constraint "ck__auth_users__locale"
        check ("locale" in ('en', 'es'));
    `);
  }
}
