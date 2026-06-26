import { describe, expect, it } from "vitest";
import { Migration20260614120000CreateSocialAuthDataModel } from "./Migration20260614120000CreateSocialAuthDataModel";
import { authMigrations } from "./index";

function collectSql(migration: { addSql(sql: string): void; up(): void }) {
  const statements: string[] = [];
  migration.addSql = (sql: string) => {
    statements.push(sql);
  };
  migration.up();

  return statements.join("\n");
}

describe("social auth data model migration", () => {
  it("makes user email nullable and adds partial uniqueness for non-null normalized email", () => {
    const sql = collectSql(
      new Migration20260614120000CreateSocialAuthDataModel(),
    );

    expect(sql).toContain(
      'alter table "auth_users" alter column "email" drop not null',
    );
    expect(sql).toContain(
      'drop constraint if exists "uq__auth_users__tenant_id_email"',
    );
    expect(sql).toContain('"uq__auth_users__tenant_id_lower_email"');
    expect(sql).toContain('lower("email")');
    expect(sql).toContain('where "email" is not null');
  });

  it("creates external identities, auth methods, link tokens, and provider tokens", () => {
    const sql = collectSql(
      new Migration20260614120000CreateSocialAuthDataModel(),
    );

    expect(sql).toContain(
      'create table if not exists "auth_external_identities"',
    );
    expect(sql).toContain("\"provider\" in ('telegram', 'discord')");
    expect(sql).toContain(
      '"uq__auth_external_identities__tenant_provider_subject"',
    );
    expect(sql).toContain('create table if not exists "auth_methods"');
    expect(sql).toContain(
      "\"method\" in ('password', 'telegram_web_login', 'telegram_tma', 'telegram_bot', 'discord_oauth', 'discord_bot')",
    );
    expect(sql).toContain('insert into "auth_methods"');
    expect(sql).toContain("coalesce(\"password_hash\", '') <> ''");
    expect(sql).toContain('create table if not exists "auth_link_tokens"');
    expect(sql).toContain("\"purpose\" in ('login', 'link')");
    expect(sql).toContain('create table if not exists "auth_provider_tokens"');
    expect(sql).toContain('"ciphertext" text not null');
    expect(sql).toContain('"auth_tag" varchar(64) not null');
  });

  it("uses migration freshness-compliant names for expression and partial indexes", () => {
    const sql = collectSql(
      new Migration20260614120000CreateSocialAuthDataModel(),
    );

    expect(sql).toContain('"uq__auth_users__tenant_id_lower_email"');
    expect(sql).toContain(
      '"ix__auth_methods__tenant_id_auth_user_id_last_used_at_desc"',
    );
    expect(sql).toContain('"uq__auth_methods__tenant_id_auth_user_id"');
    expect(sql).toContain(
      '"uq__auth_methods__tenant_id_external_identity_id_method"',
    );
  });

  it("registers the social auth migration", () => {
    expect(authMigrations).toContain(
      Migration20260614120000CreateSocialAuthDataModel,
    );
  });
});
