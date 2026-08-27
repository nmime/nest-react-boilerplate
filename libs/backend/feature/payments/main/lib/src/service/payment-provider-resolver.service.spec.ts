// @requirements REQ-PAYMENT-PROVIDER-001 REQ-PAYMENT-PROVIDER-004
import { describe, expect, it, vi } from 'vitest';
import {
  type PaymentProviderHealthRecord,
  type PaymentProviderPort,
  type PaymentProviderRecord,
} from '@app/backend-feature-payments-shared';
import { PaymentProviderUnavailableException } from '../providers/provider-errors';
import { PaymentProviderResolver } from './payment-provider-resolver.service';

const TenantId = '123e4567-e89b-12d3-a456-426614174000';
const OtherTenantId = '123e4567-e89b-12d3-a456-426614174001';

function row(overrides: Partial<PaymentProviderRecord> & Pick<PaymentProviderRecord, 'code'>): PaymentProviderRecord {
  return {
    id: `${overrides.code}-id`,
    kind: 'crypto',
    enabled: true,
    priority: 100,
    tenantId: null,
    supportedCurrencies: [],
    config: {},
    baseUrl: `https://${overrides.code}.example.test`,
    version: '1',
    credentialsEncrypted: { keyId: 'env' },
    timeoutMs: 15_000,
    regionAllow: null,
    regionDeny: [],
    createdAt: new Date('2026-08-27T00:00:00.000Z'),
    updatedAt: new Date('2026-08-27T00:00:00.000Z'),
    updatedBy: null,
    ...overrides,
  };
}

function adapter(providerCode: string): PaymentProviderPort {
  return {
    providerCode,
    createPayment: vi.fn(),
    getStatus: vi.fn(),
    verifyWebhook: vi.fn(),
  } as unknown as PaymentProviderPort;
}

function health(providerCode: string, state: PaymentProviderHealthRecord['state']): PaymentProviderHealthRecord {
  return {
    providerCode,
    state,
    consecutiveErrors: 0,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastErrorClass: null,
    updatedAt: new Date('2026-08-27T00:00:00.000Z'),
  };
}

function harness(
  rows: readonly PaymentProviderRecord[],
  states: Record<string, PaymentProviderHealthRecord['state']> = {},
) {
  let now = 0;
  const listPaymentProviders = vi.fn(async () => [...rows]);
  const findPaymentProvider = vi.fn(async (code: string, tenantId?: string) => {
    const matchingCode = rows.filter((candidate) => candidate.code === code);
    if (tenantId !== undefined) {
      const tenantMatch = matchingCode.find(
        (candidate) => typeof candidate.tenantId === 'string' && candidate.tenantId === tenantId,
      );
      if (tenantMatch !== undefined) {
        return tenantMatch;
      }
    }
    return matchingCode.find((candidate) => candidate.tenantId === null) ?? null;
  });
  const persistence = { listPaymentProviders, findPaymentProvider };
  const healthService = {
    get: vi.fn(async (code: string) => health(code, states[code] ?? 'up')),
  };
  const registry = new Map(rows.map((candidate) => [candidate.code, adapter(candidate.code)]));
  const resolver = new PaymentProviderResolver(persistence as never, healthService as never, registry, {
    ttlMs: 5_000,
    now: () => now,
  });
  return {
    resolver,
    registry,
    listPaymentProviders,
    findPaymentProvider,
    healthService,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
  };
}

function expectUnavailable(error: unknown): void {
  expect(error).toBeInstanceOf(PaymentProviderUnavailableException);
  expect((error as PaymentProviderUnavailableException).toProblemDetails()).toMatchObject({
    status: 503,
    code: 'payment-provider-unavailable',
  });
}

describe('PaymentProviderResolver', () => {
  it('uses the default five-second clock policy when no resolver options are supplied', async () => {
    const providerRow = row({ code: 'alpha' });
    const persistence = {
      listPaymentProviders: vi.fn(async () => [providerRow]),
      findPaymentProvider: vi.fn(),
    };
    const healthService = { get: vi.fn(async () => health('alpha', 'up')) };
    const registry = new Map([['alpha', adapter('alpha')]]);
    const resolver = new PaymentProviderResolver(persistence as never, healthService as never, registry);

    await expect(resolver.resolveForCreate({ tenantId: TenantId, kind: 'crypto' })).resolves.toMatchObject({
      record: { code: 'alpha' },
    });
  });

  it('chooses the lowest priority eligible provider within the requested kind', async () => {
    const high = row({ code: 'high', priority: 90 });
    const low = row({ code: 'low', priority: 10 });
    const fiat = row({ code: 'fiat', priority: 1, kind: 'fiat' });
    const { resolver } = harness([high, fiat, low]);

    await expect(
      resolver.resolveForCreate({ tenantId: TenantId, kind: 'crypto', tenantRegion: 'DE' }),
    ).resolves.toMatchObject({
      record: { code: 'low' },
      provider: { providerCode: 'low' },
    });
  });

  it('uses a tenant row instead of the platform row for the same provider code regardless of row order', async () => {
    const platform = row({ code: 'shadowed', priority: 1, baseUrl: 'https://platform.example.test' });
    const tenant = row({
      code: 'shadowed',
      tenantId: TenantId,
      priority: 80,
      baseUrl: 'https://tenant.example.test',
    });
    const other = row({ code: 'other', priority: 50 });
    const foreign = row({ code: 'foreign', tenantId: OtherTenantId, priority: 0 });
    const { resolver } = harness([tenant, platform, other, foreign]);

    await expect(resolver.resolveForCreate({ tenantId: TenantId, kind: 'crypto' })).resolves.toMatchObject({
      record: { code: 'other' },
    });
    await expect(
      resolver.resolveForCreate({ tenantId: TenantId, kind: 'crypto', providerCode: 'shadowed' }),
    ).resolves.toMatchObject({ record: { baseUrl: 'https://tenant.example.test' } });
  });

  it.each([
    ['disabled', row({ code: 'disabled', enabled: false })],
    ['missing credentials', row({ code: 'unconfigured', credentialsEncrypted: null })],
    ['region denied', row({ code: 'denied', regionDeny: ['ru'] })],
    ['region allow miss', row({ code: 'allow', regionAllow: ['US'] })],
    ['missing adapter', row({ code: 'missing-adapter' })],
  ])('fails closed with 503 when the only provider is %s', async (_label, providerRow) => {
    const data = harness([providerRow]);
    if (providerRow.code === 'missing-adapter') {
      data.registry.clear();
    }

    await expect(
      data.resolver.resolveForCreate({ tenantId: TenantId, kind: 'crypto', tenantRegion: 'RU' }),
    ).rejects.toSatisfy((error: unknown) => {
      expectUnavailable(error);
      return true;
    });
  });

  it('normalizes region whitespace/case and requires a region when allow-listing is active', async () => {
    const providerRow = row({ code: 'allow', regionAllow: ['de'] });
    const { resolver } = harness([providerRow]);

    await expect(
      resolver.resolveForCreate({ tenantId: TenantId, kind: 'crypto', tenantRegion: ' de ' }),
    ).resolves.toMatchObject({
      record: { code: 'allow' },
    });
    await expect(resolver.resolveForCreate({ tenantId: TenantId, kind: 'crypto' })).rejects.toBeInstanceOf(
      PaymentProviderUnavailableException,
    );
  });

  it('excludes down and disabled health while allowing degraded', async () => {
    const down = row({ code: 'down', priority: 1 });
    const disabled = row({ code: 'health-disabled', priority: 2 });
    const degraded = row({ code: 'degraded', priority: 3 });
    const { resolver } = harness([down, disabled, degraded], {
      down: 'down',
      'health-disabled': 'disabled',
      degraded: 'degraded',
    });

    await expect(resolver.resolveForCreate({ tenantId: TenantId, kind: 'crypto' })).resolves.toMatchObject({
      record: { code: 'degraded' },
    });
  });

  it('uses code as the deterministic priority tie-break and fails closed when nothing matches', async () => {
    const tie = harness([row({ code: 'bravo', priority: 10 }), row({ code: 'alpha', priority: 10 })]);
    await expect(tie.resolver.resolveForCreate({ tenantId: TenantId, kind: 'crypto' })).resolves.toMatchObject({
      record: { code: 'alpha' },
    });
    const { resolver } = harness([row({ code: 'alpha' })]);

    await expect(resolver.resolveForCreate({ tenantId: TenantId, kind: 'fiat' })).rejects.toBeInstanceOf(
      PaymentProviderUnavailableException,
    );
    await expect(
      resolver.resolveForCreate({ tenantId: TenantId, kind: 'crypto', providerCode: 'missing' }),
    ).rejects.toBeInstanceOf(PaymentProviderUnavailableException);
  });

  it('caches DB rows for five seconds and supports tenant/all invalidation', async () => {
    const { resolver, listPaymentProviders, advance } = harness([row({ code: 'alpha' })]);

    await resolver.resolveForCreate({ tenantId: TenantId, kind: 'crypto' });
    await resolver.resolveForCreate({ tenantId: TenantId, kind: 'crypto' });
    expect(listPaymentProviders).toHaveBeenCalledTimes(1);

    advance(5_000);
    await resolver.resolveForCreate({ tenantId: TenantId, kind: 'crypto' });
    expect(listPaymentProviders).toHaveBeenCalledTimes(2);

    resolver.invalidate(TenantId);
    await resolver.resolveForCreate({ tenantId: TenantId, kind: 'crypto' });
    expect(listPaymentProviders).toHaveBeenCalledTimes(3);

    resolver.invalidate();
    await resolver.resolveForCreate({ tenantId: TenantId, kind: 'crypto' });
    expect(listPaymentProviders).toHaveBeenCalledTimes(4);
  });

  it('lets webhooks and recovery bypass enabled, region, and health routing gates', async () => {
    const disabledDown = row({ code: 'alpha', enabled: false, regionDeny: ['US'] });
    const { resolver, findPaymentProvider, healthService } = harness([disabledDown], { alpha: 'down' });

    await expect(resolver.resolveForWebhook('alpha', TenantId)).resolves.toMatchObject({
      record: { code: 'alpha' },
      provider: { providerCode: 'alpha' },
    });
    await expect(resolver.resolveForRecovery('alpha', TenantId)).resolves.toMatchObject({ record: { code: 'alpha' } });
    expect(findPaymentProvider).toHaveBeenCalledTimes(2);
    expect(healthService.get).not.toHaveBeenCalled();

    await expect(resolver.resolveForWebhook('alpha')).resolves.toMatchObject({ record: { code: 'alpha' } });
  });

  it('still fails closed for a webhook/recovery code with no row or no adapter', async () => {
    const data = harness([row({ code: 'alpha' })]);

    await expect(data.resolver.resolveForWebhook('missing')).rejects.toBeInstanceOf(
      PaymentProviderUnavailableException,
    );
    data.registry.clear();
    await expect(data.resolver.resolveForRecovery('alpha')).rejects.toBeInstanceOf(PaymentProviderUnavailableException);
  });
});
