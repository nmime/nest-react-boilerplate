import { Migration } from '@mikro-orm/migrations';

export class Migration20260828120000AddZhAuthUserLocale extends Migration {
  override up(): void {
    this.addSql(`
      alter table "auth_users" drop constraint if exists "ck__auth_users__locale";
      alter table "auth_users"
        add constraint "ck__auth_users__locale"
        check ("locale" in ('en', 'ru', 'zh'));
    `);
  }

  override down(): void {
    this.addSql(`
      update "auth_users" set "locale" = 'en' where "locale" = 'zh';
      alter table "auth_users" drop constraint if exists "ck__auth_users__locale";
      alter table "auth_users"
        add constraint "ck__auth_users__locale"
        check ("locale" in ('en', 'ru'));
    `);
  }
}
