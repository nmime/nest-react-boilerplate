import { Migration } from '@mikro-orm/migrations';

export class Migration20260716120000AddTelegramOidcChannel extends Migration {
  override up(): void {
    this.addSql(
      `alter table "auth_external_identities" drop constraint if exists "ck__auth_external_identities__channel";`,
    );
    this.addSql(
      `update "auth_external_identities" set "channel" = 'telegram_oidc' where "channel" = 'telegram_web_login';`,
    );
    this.addSql(
      `alter table "auth_external_identities" add constraint "ck__auth_external_identities__channel" check ("channel" in ('telegram_oidc', 'telegram_tma', 'telegram_bot', 'discord_oauth', 'discord_bot'));`,
    );
    this.addSql(`alter table "auth_methods" drop constraint if exists "ck__auth_methods__method";`);
    this.addSql(`update "auth_methods" set "method" = 'telegram_oidc' where "method" = 'telegram_web_login';`);
    this.addSql(
      `alter table "auth_methods" add constraint "ck__auth_methods__method" check ("method" in ('password', 'telegram_oidc', 'telegram_tma', 'telegram_bot', 'discord_oauth', 'discord_bot'));`,
    );
  }

  override down(): void {
    this.addSql(`alter table "auth_methods" drop constraint if exists "ck__auth_methods__method";`);
    this.addSql(`update "auth_methods" set "method" = 'telegram_web_login' where "method" = 'telegram_oidc';`);
    this.addSql(
      `alter table "auth_methods" add constraint "ck__auth_methods__method" check ("method" in ('password', 'telegram_web_login', 'telegram_tma', 'telegram_bot', 'discord_oauth', 'discord_bot'));`,
    );
    this.addSql(
      `alter table "auth_external_identities" drop constraint if exists "ck__auth_external_identities__channel";`,
    );
    this.addSql(
      `update "auth_external_identities" set "channel" = 'telegram_web_login' where "channel" = 'telegram_oidc';`,
    );
    this.addSql(
      `alter table "auth_external_identities" add constraint "ck__auth_external_identities__channel" check ("channel" in ('telegram_web_login', 'telegram_tma', 'telegram_bot', 'discord_oauth', 'discord_bot'));`,
    );
  }
}
