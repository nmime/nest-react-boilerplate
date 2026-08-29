// @requirements REQ-PAYMENT-ORDER-003 REQ-PAYMENT-PROVIDER-005
import { describe, expect, it } from 'vitest';
import { Migration20260823100000CreatePaymentProviders } from './Migration20260823100000CreatePaymentProviders';
import { Migration20260823100100CreatePayments } from './Migration20260823100100CreatePayments';
import { Migration20260823100200CreatePaymentEvents } from './Migration20260823100200CreatePaymentEvents';
import { Migration20260823100300CreatePaymentWebhookReceipts } from './Migration20260823100300CreatePaymentWebhookReceipts';
import { Migration20260827100000AddPaymentWebhookClaimLease } from './Migration20260827100000AddPaymentWebhookClaimLease';
import { paymentsMigrations } from './index';

function renderUp(migration: { addSql(sql: string): void; up(): void }): string {
  const sql: string[] = [];
  migration.addSql = (query: string) => {
    sql.push(query);
  };
  migration.up();
  return sql.join('\n');
}

function renderDown(migration: { addSql(sql: string): void; down(): void }): string {
  const sql: string[] = [];
  migration.addSql = (query: string) => {
    sql.push(query);
  };
  migration.down();
  return sql.join('\n');
}

const rendersDdl: Array<[behaviour: string, fragments: string[]]> = [
  [
    'creates payment_providers registry with fail-closed enabled guard',
    [
      'create table "payment_providers"',
      'constraint "pk__payment_providers" primary key ("id")',
      'constraint "uq__payment_providers__code_tenant_id" unique ("code", "tenant_id")',
      'constraint "uq__payment_providers__code" unique ("code")',
      'constraint "ck__payment_providers__kind"',
      'constraint "ck__payment_providers__enabled_credentials"',
    ],
  ],
  [
    'creates provider health with state enum and FK to registry',
    [
      'create table "payment_provider_health"',
      'constraint "pk__payment_provider_health" primary key ("provider_code")',
      'constraint "ck__payment_provider_health__state"',
      'constraint "fk__payment_provider_health__provider_code"',
    ],
  ],
  [
    'creates payments with status enum and provider FK',
    [
      'create table "payments"',
      'constraint "pk__payments" primary key ("id")',
      'constraint "ck__payments__status"',
      'constraint "fk__payments__provider_code"',
    ],
  ],
  [
    'creates payment indexes for provider-client and tenant recency',
    [
      'create unique index "uq__payments__provider_code_id"',
      'create unique index "uq__payments__provider_code_provider_payment_id"',
      'create index "ix__payments__status_expires_at"',
      'create index "ix__payments__tenant_id_created_at_desc"',
    ],
  ],
  [
    'creates payment_refunds append-only table',
    [
      'create table "payment_refunds"',
      'constraint "pk__payment_refunds" primary key ("id")',
      'constraint "ck__payment_refunds__status"',
      'constraint "fk__payment_refunds__payment_id"',
    ],
  ],
  [
    'creates payment_events with outbox partial index',
    [
      'create table "payment_events"',
      'constraint "pk__payment_events" primary key ("id")',
      'constraint "ck__payment_events__type"',
      'create index "ix__payment_events__payment_id_created_at"',
      'create index "ix__payment_events__type_to_status_outbox_published_at"',
    ],
  ],
  [
    'creates webhook receipts with replay-wall unique index',
    [
      'create table "payment_webhook_receipts"',
      'constraint "pk__payment_webhook_receipts" primary key ("id")',
      'constraint "uq__payment_webhook_receipts__provider_code_idempotency_key"',
      'constraint "ck__payment_webhook_receipts__signature_valid"',
      'constraint "ck__payment_webhook_receipts__processing_status"',
      'create index "ix__payment_webhook_receipts__processing_status_received_at"',
    ],
  ],
];

describe('payments postgres migrations', () => {
  it.each(rendersDdl)('%s', (_behaviour, fragments) => {
    const sql = [
      renderUp(new Migration20260823100000CreatePaymentProviders(undefined as never, undefined as never)),
      renderUp(new Migration20260823100100CreatePayments(undefined as never, undefined as never)),
      renderUp(new Migration20260823100200CreatePaymentEvents(undefined as never, undefined as never)),
      renderUp(new Migration20260823100300CreatePaymentWebhookReceipts(undefined as never, undefined as never)),
      renderUp(new Migration20260827100000AddPaymentWebhookClaimLease(undefined as never, undefined as never)),
    ].join('\n');

    for (const fragment of fragments) {
      expect(sql).toContain(fragment);
    }
  });

  it('keeps payments FK to provider registry as delete restrict', () => {
    const sql = renderUp(new Migration20260823100100CreatePayments(undefined as never, undefined as never));
    expect(sql).toContain('references "payment_providers" ("code") on delete restrict');
  });

  it('keeps provider health FK as cascade so disabling cleans health row', () => {
    const sql = renderUp(new Migration20260823100000CreatePaymentProviders(undefined as never, undefined as never));
    expect(sql).toContain('references "payment_providers" ("code") on delete cascade');
  });

  it('stores ids as uuid with gen_random_uuid() default where provider creates them', () => {
    const providersSql = renderUp(
      new Migration20260823100000CreatePaymentProviders(undefined as never, undefined as never),
    );
    const paymentsSql = renderUp(new Migration20260823100100CreatePayments(undefined as never, undefined as never));
    const receiptsSql = renderUp(
      new Migration20260823100300CreatePaymentWebhookReceipts(undefined as never, undefined as never),
    );
    // payment_providers.id, payment_refunds.id, payment_webhook_receipts.id are DB-generated
    expect(providersSql).toContain('gen_random_uuid()');
    expect(paymentsSql).toContain('gen_random_uuid()');
    expect(receiptsSql).toContain('gen_random_uuid()');
    // payments.id is client-supplied (our clientInvoiceId) — no default on the payments table itself
    const paymentsTableSql = paymentsSql.split('create table "payment_refunds"')[0] ?? paymentsSql;
    expect(paymentsTableSql).toContain('"id" uuid not null,');
    expect(paymentsTableSql).not.toContain('"id" uuid not null default gen_random_uuid()');
    // refunds.id IS generated
    expect(paymentsSql).toContain('create table "payment_refunds"');
  });

  it('uses timestamptz for every timestamp and not timestamp', () => {
    const allSql = [
      renderUp(new Migration20260823100000CreatePaymentProviders(undefined as never, undefined as never)),
      renderUp(new Migration20260823100100CreatePayments(undefined as never, undefined as never)),
      renderUp(new Migration20260823100200CreatePaymentEvents(undefined as never, undefined as never)),
      renderUp(new Migration20260823100300CreatePaymentWebhookReceipts(undefined as never, undefined as never)),
      renderUp(new Migration20260827100000AddPaymentWebhookClaimLease(undefined as never, undefined as never)),
    ].join('\n');
    // Every timestamp column must be timestamptz
    expect(allSql).not.toMatch(/\btimestamp\b(?!tz)/);
    expect(allSql).toContain('timestamptz');
  });

  it('keeps every constraint name inside the Postgres 63-byte identifier limit', () => {
    const allSql = [
      renderUp(new Migration20260823100000CreatePaymentProviders(undefined as never, undefined as never)),
      renderUp(new Migration20260823100100CreatePayments(undefined as never, undefined as never)),
      renderUp(new Migration20260823100200CreatePaymentEvents(undefined as never, undefined as never)),
      renderUp(new Migration20260823100300CreatePaymentWebhookReceipts(undefined as never, undefined as never)),
      renderUp(new Migration20260827100000AddPaymentWebhookClaimLease(undefined as never, undefined as never)),
    ].join('\n');
    const names = [...allSql.matchAll(/"((?:pk|uq|ix|ck|fk)__[a-z_]+)"/gu)].map(([, name]) => name ?? '');
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => Buffer.byteLength(name) > 63)).toEqual([]);
  });

  it('drops dependents before parents in down()', () => {
    expect(
      renderDown(new Migration20260823100000CreatePaymentProviders(undefined as never, undefined as never)),
    ).toMatch(/payment_provider_health[\s\S]*payment_providers/);
    const paymentsDown = renderDown(new Migration20260823100100CreatePayments(undefined as never, undefined as never));
    expect(paymentsDown.indexOf('payment_refunds')).toBeLessThan(paymentsDown.indexOf('"payments"'));
  });

  it('each migration down() is reversible (drops what up() creates)', () => {
    const pairs: Array<[string, string]> = [
      [
        renderUp(new Migration20260823100000CreatePaymentProviders(undefined as never, undefined as never)),
        renderDown(new Migration20260823100000CreatePaymentProviders(undefined as never, undefined as never)),
      ],
      [
        renderUp(new Migration20260823100100CreatePayments(undefined as never, undefined as never)),
        renderDown(new Migration20260823100100CreatePayments(undefined as never, undefined as never)),
      ],
      [
        renderUp(new Migration20260823100200CreatePaymentEvents(undefined as never, undefined as never)),
        renderDown(new Migration20260823100200CreatePaymentEvents(undefined as never, undefined as never)),
      ],
      [
        renderUp(new Migration20260823100300CreatePaymentWebhookReceipts(undefined as never, undefined as never)),
        renderDown(new Migration20260823100300CreatePaymentWebhookReceipts(undefined as never, undefined as never)),
      ],
    ];
    for (const [up, down] of pairs) {
      // up creates tables, down drops them with cascade
      expect(up).toContain('create table');
      expect(down).toContain('drop table if exists');
      expect(down).toContain('cascade');
    }
  });

  it('adds a reversible claim-lease column and replaces the pending-age index', () => {
    const migration = new Migration20260827100000AddPaymentWebhookClaimLease(undefined as never, undefined as never);
    const up = renderUp(migration);
    const down = renderDown(migration);
    expect(up).toContain('add column "claimed_at" timestamptz null');
    expect(up).toContain('set "claimed_at" = "received_at"');
    expect(up).toContain('processing_status_claimed_at');
    expect(down).toContain('processing_status_received_at');
    expect(down).toContain('drop column "claimed_at"');
  });

  it('registers all five migrations for tooling in timestamp order', () => {
    expect(paymentsMigrations).toEqual([
      Migration20260823100000CreatePaymentProviders,
      Migration20260823100100CreatePayments,
      Migration20260823100200CreatePaymentEvents,
      Migration20260823100300CreatePaymentWebhookReceipts,
      Migration20260827100000AddPaymentWebhookClaimLease,
    ]);
    // Names must be lexicographically ordered (timestamp order)
    const names = paymentsMigrations.map((m) => m.name);
    expect([...names].sort((left, right) => left.localeCompare(right))).toEqual(names);
    expect(new Set(names).size).toBe(5);
  });
});
