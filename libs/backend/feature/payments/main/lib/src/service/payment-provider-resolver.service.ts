import {
  type PaymentProviderKind,
  type PaymentProviderPort,
  type PaymentProviderRecord,
  type PaymentProviderRegistry,
  PaymentsPersistence,
} from '@app/backend-feature-payments-shared';
import { PaymentProviderUnavailableException } from '../providers/provider-errors';
import { ProviderHealthService } from './provider-health.service';

export interface PaymentProviderResolverOptions {
  readonly ttlMs?: number;
  readonly now?: () => number;
}

export const PaymentProviderResolverOptionsInjectToken = Symbol('PaymentProviderResolverOptionsInjectToken');

export interface ResolvePaymentProviderRequest {
  readonly tenantId: string;
  readonly tenantRegion?: string;
  readonly kind: PaymentProviderKind;
  readonly providerCode?: string;
}

export interface ResolvedPaymentProvider {
  readonly record: PaymentProviderRecord;
  readonly provider: PaymentProviderPort;
}

interface RegistryCacheEntry {
  readonly expiresAt: number;
  readonly rows: readonly PaymentProviderRecord[];
}

function normalizedRegion(region: string): string {
  return region.trim().toUpperCase();
}

function isRegionPermitted(record: PaymentProviderRecord, tenantRegion: string | undefined): boolean {
  const region = tenantRegion === undefined ? undefined : normalizedRegion(tenantRegion);
  const denied = new Set(record.regionDeny.map(normalizedRegion));
  if (region !== undefined && denied.has(region)) {
    return false;
  }
  if (record.regionAllow === null) {
    return true;
  }
  if (region === undefined) {
    return false;
  }
  return record.regionAllow.map(normalizedRegion).includes(region);
}

function applyTenantShadow(rows: readonly PaymentProviderRecord[], tenantId: string): readonly PaymentProviderRecord[] {
  const selected = new Map<string, PaymentProviderRecord>();
  for (const row of rows) {
    if (row.tenantId !== null && row.tenantId !== tenantId) {
      continue;
    }
    const current = selected.get(row.code);
    if (row.tenantId === tenantId || current === undefined) {
      selected.set(row.code, row);
    }
  }
  return [...selected.values()];
}

/** Resolves DB registry rows to executable adapters without guessing a fallback. */
export class PaymentProviderResolver {
  private readonly cache = new Map<string, RegistryCacheEntry>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(
    private readonly persistence: PaymentsPersistence,
    private readonly health: ProviderHealthService,
    private readonly registry: PaymentProviderRegistry,
    options: PaymentProviderResolverOptions = {},
  ) {
    this.ttlMs = options.ttlMs ?? 5_000;
    this.now = options.now ?? Date.now;
  }

  invalidate(tenantId?: string): void {
    if (tenantId === undefined) {
      this.cache.clear();
      return;
    }
    this.cache.delete(tenantId);
  }

  async resolveForCreate(request: ResolvePaymentProviderRequest): Promise<ResolvedPaymentProvider> {
    const rows = applyTenantShadow(await this.registryRows(request.tenantId), request.tenantId)
      .filter((row) => row.kind === request.kind)
      .filter((row) => request.providerCode === undefined || row.code === request.providerCode)
      .filter((row) => row.enabled)
      .filter((row) => row.credentialsEncrypted !== null)
      .filter((row) => isRegionPermitted(row, request.tenantRegion))
      .filter((row) => this.registry.has(row.code));

    const eligible: PaymentProviderRecord[] = [];
    // Health reads are deliberately ordered with the already-prioritized registry rows;
    // a persistence adapter may serialize them on one unit of work.
    /* eslint-disable no-await-in-loop */
    for (const row of rows) {
      const health = await this.health.get(row.code);
      if (health.state !== 'down' && health.state !== 'disabled') {
        eligible.push(row);
      }
    }
    /* eslint-enable no-await-in-loop */
    eligible.sort((left, right) => left.priority - right.priority || left.code.localeCompare(right.code));

    const record = eligible[0];
    const provider = record === undefined ? undefined : this.registry.get(record.code);
    if (record === undefined || provider === undefined) {
      throw new PaymentProviderUnavailableException({
        meta: {
          tenantId: request.tenantId,
          tenantRegion: request.tenantRegion,
          kind: request.kind,
          providerCode: request.providerCode,
        },
      });
    }
    return { record, provider };
  }

  /** Webhook verification bypasses enabled/region/health gates for in-flight settlement. */
  async resolveForWebhook(providerCode: string, tenantId?: string): Promise<ResolvedPaymentProvider> {
    return this.resolveExisting(providerCode, tenantId);
  }

  /** Reconciliation has the same recovery posture as webhook ingress. */
  async resolveForRecovery(providerCode: string, tenantId?: string): Promise<ResolvedPaymentProvider> {
    return this.resolveExisting(providerCode, tenantId);
  }

  private async resolveExisting(providerCode: string, tenantId?: string): Promise<ResolvedPaymentProvider> {
    const [record, provider] = await Promise.all([
      this.persistence.findPaymentProvider(providerCode, tenantId),
      Promise.resolve(this.registry.get(providerCode)),
    ]);
    if (record === null || provider === undefined) {
      throw new PaymentProviderUnavailableException({ meta: { providerCode, tenantId, recovery: true } });
    }
    return { record, provider };
  }

  private async registryRows(tenantId: string): Promise<readonly PaymentProviderRecord[]> {
    const cached = this.cache.get(tenantId);
    const now = this.now();
    if (cached !== undefined && cached.expiresAt > now) {
      return cached.rows;
    }
    const rows = await this.persistence.listPaymentProviders(tenantId);
    this.cache.set(tenantId, { expiresAt: now + this.ttlMs, rows });
    return rows;
  }
}
