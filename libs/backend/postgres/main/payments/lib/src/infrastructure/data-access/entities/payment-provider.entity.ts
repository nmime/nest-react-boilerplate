import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import type {
  PaymentProviderKind,
  PaymentProviderSupportedCurrency,
  UpsertPaymentProviderParams,
} from '@app/backend-feature-payments-shared';

export class PaymentProviderEntity {
  id: string = randomUUID();
  code!: string;
  kind!: PaymentProviderKind;
  enabled = false;
  priority = 100;
  tenantId: string | null = null;
  supportedCurrencies: readonly PaymentProviderSupportedCurrency[] = [];
  config: Record<string, unknown> = {};
  baseUrl!: string;
  version!: string;
  credentialsEncrypted: Record<string, unknown> | null = null;
  timeoutMs = 15_000;
  regionAllow: readonly string[] | null = null;
  regionDeny: readonly string[] = [];
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
  updatedBy: string | null = null;

  constructor(input?: UpsertPaymentProviderParams) {
    if (!input) {
      return;
    }
    this.id = input.id ?? randomUUID();
    this.code = input.code;
    this.kind = input.kind;
    this.enabled = input.enabled ?? false;
    this.priority = input.priority ?? 100;
    this.tenantId = input.tenantId ?? null;
    this.supportedCurrencies = input.supportedCurrencies ?? [];
    this.config = input.config ?? {};
    this.baseUrl = input.baseUrl;
    this.version = input.version;
    this.credentialsEncrypted = input.credentialsEncrypted ?? null;
    this.timeoutMs = input.timeoutMs ?? 15_000;
    this.regionAllow = input.regionAllow ?? null;
    this.regionDeny = input.regionDeny ?? [];
    this.updatedBy = input.updatedBy ?? null;
  }
}

export const PaymentProviderEntitySchema = new EntitySchema<PaymentProviderEntity>({
  class: PaymentProviderEntity,
  tableName: 'payment_providers',
  properties: {
    id: { type: 'uuid', primary: true },
    code: { type: 'text' },
    kind: { type: 'text' },
    enabled: { type: 'boolean', default: false },
    priority: { type: 'integer', default: 100 },
    tenantId: { type: 'uuid', fieldName: 'tenant_id', nullable: true },
    supportedCurrencies: { type: 'json', fieldName: 'supported_currencies', defaultRaw: "'[]'::jsonb" },
    config: { type: 'json', defaultRaw: "'{}'::jsonb" },
    baseUrl: { type: 'text', fieldName: 'base_url' },
    version: { type: 'text' },
    credentialsEncrypted: { type: 'json', fieldName: 'credentials_encrypted', nullable: true },
    timeoutMs: { type: 'integer', fieldName: 'timeout_ms', default: 15_000 },
    regionAllow: { type: 'json', fieldName: 'region_allow', nullable: true },
    regionDeny: { type: 'json', fieldName: 'region_deny', defaultRaw: "'[]'::jsonb" },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: {
      type: 'timestamptz',
      fieldName: 'updated_at',
      onCreate: () => new Date(),
      onUpdate: () => new Date(),
    },
    updatedBy: { type: 'uuid', fieldName: 'updated_by', nullable: true },
  },
  uniques: [
    { name: 'uq__payment_providers__code_tenant_id', properties: ['code', 'tenantId'] },
    { name: 'uq__payment_providers__code', properties: ['code'] },
  ],
});
