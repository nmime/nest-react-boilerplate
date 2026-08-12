import type { Transaction } from '@mikro-orm/core';
import { Migration } from '@mikro-orm/migrations';

export class Migration20260812090000CreateFiatCurrencies extends Migration {
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
    // numeric(15,10) is not an arbitrary width. Five integer digits cover every fiat rate that has
    // ever existed, and fifteen significant digits is the most the exact ratio arithmetic in
    // @app/backend-feature-fiat-currency-shared can hold without overflowing a safe integer. A
    // wider column would let an operator store a rate the application then refuses to use.
    this.addSql(`
      create table "fiat_currencies" (
        "code" varchar(3) not null,
        "minor_unit_exponent" smallint not null default 2,
        "symbol" varchar(16) not null,
        "image_url" text null,
        "active" boolean not null default true,
        "display_order" integer not null default 0,
        "usd_per_unit" numeric(15,10) null,
        "rate_as_of" timestamptz null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "pk__fiat_currencies" primary key ("code"),
        constraint "ck__fiat_currencies__code" check ("code" ~ '^[A-Z]{3}$'),
        constraint "ck__fiat_currencies__minor_unit_exponent" check ("minor_unit_exponent" between 0 and 12),
        constraint "ck__fiat_currencies__usd_per_unit" check ("usd_per_unit" is null or "usd_per_unit" > 0),
        constraint "ck__fiat_currencies__rate_pairing" check (("usd_per_unit" is null) = ("rate_as_of" is null))
      );
    `);
    this.addSql(
      'create index "ix__fiat_currencies__active_display_order" on "fiat_currencies" ("active", "display_order");',
    );

    this.addSql(`
      create table "fiat_currency_translations" (
        "code" varchar(3) not null,
        "locale" varchar(35) not null,
        "name" varchar(120) not null,
        "symbol" varchar(16) null,
        constraint "pk__fiat_currency_translations" primary key ("code", "locale"),
        constraint "fk__fiat_currency_translations__code" foreign key ("code")
          references "fiat_currencies" ("code") on delete cascade
      );
    `);
    this.addSql('create index "ix__fiat_currency_translations__locale" on "fiat_currency_translations" ("locale");');

    this.addSql(`
      create table "fiat_currency_rates" (
        "id" uuid not null,
        "code" varchar(3) not null,
        "usd_per_unit" numeric(15,10) not null,
        "as_of" timestamptz not null,
        "source" varchar(64) not null,
        "recorded_at" timestamptz not null default now(),
        constraint "pk__fiat_currency_rates" primary key ("id"),
        constraint "uq__fiat_currency_rates__code_as_of_source" unique ("code", "as_of", "source"),
        constraint "ck__fiat_currency_rates__usd_per_unit" check ("usd_per_unit" > 0),
        constraint "fk__fiat_currency_rates__code" foreign key ("code")
          references "fiat_currencies" ("code") on delete cascade
      );
    `);
    // Descending on "as_of" because every read of this table asks for the newest rows first.
    this.addSql(
      'create index "ix__fiat_currency_rates__code_as_of_desc" on "fiat_currency_rates" ("code", "as_of" desc);',
    );
  }

  override down(): void {
    this.addSql('drop table if exists "fiat_currency_rates" cascade;');
    this.addSql('drop table if exists "fiat_currency_translations" cascade;');
    this.addSql('drop table if exists "fiat_currencies" cascade;');
  }
}
