// @requirements REQ-AUTH-TENANT-ISOLATION-010
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { requestContext } from '@app/backend-common-request-context';
import {
  DefaultTenantId,
  TenantIdContextKey,
  getAmbientTenantId,
  normalizeTenantId,
  requireAmbientTenantId,
  setAmbientTenantId,
  withAmbientTenant,
} from './tenant-scope';

const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';

describe('normalizeTenantId', () => {
  it('lowercases a valid uuid', () => {
    expect(normalizeTenantId('11111111-1111-4111-8111-11111111111A'.toUpperCase())).toBe(
      '11111111-1111-4111-8111-11111111111a',
    );
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['whitespace', '   '],
    ['not a uuid', 'tenant-one'],
    ['truncated uuid', '11111111-1111-4111-8111'],
  ])('rejects %s', (_label, value) => {
    expect(normalizeTenantId(value)).toBeUndefined();
  });
});

describe('DefaultTenantId', () => {
  it('is the single-tenant sentinel written into the database defaults', () => {
    // Asserted as a literal because the value also lives in migration DDL, so
    // changing it is a migration rather than a refactor.
    expect(DefaultTenantId).toBe('00000000-0000-0000-0000-000000000000');
  });

  it('matches DefaultAuthTenantId in the auth feature', () => {
    // Read from source rather than imported: this lib is `type:common` and the Nx
    // boundary forbids depending on a feature tier. An earlier attempt to invert
    // the dependency (auth re-exporting from here) also dragged this lib into the
    // tooling test runner's module graph, where `@app/backend-*` aliases do not
    // resolve. Reading the text keeps one assertion and zero coupling.
    const authSource = readFileSync(
      new URL('../../../../feature/auth/shared/lib/src/oauth/tenant-context.ts', import.meta.url),
      'utf8',
    );
    const authDefault = /DefaultAuthTenantId\s*=\s*'([0-9a-f-]+)'/u.exec(authSource)?.[1];

    expect(authDefault, 'DefaultAuthTenantId should be a literal in the auth feature').toBeDefined();
    expect(authDefault).toBe(DefaultTenantId);
  });
});

describe('setAmbientTenantId', () => {
  it('publishes the normalized tenant into the active store', () => {
    requestContext.run(() => {
      expect(setAmbientTenantId(tenantA.toUpperCase())).toBeUndefined();
      expect(getAmbientTenantId()).toBe(tenantA);
      expect(requestContext.get<string>(TenantIdContextKey)).toBe(tenantA);
    });
  });

  it('reports an invalid tenant id without touching the store', () => {
    requestContext.run(() => {
      expect(setAmbientTenantId('nope')).toEqual({
        code: 'tenant_id_invalid',
        message: 'Tenant id is not a UUID: nope',
      });
      expect(getAmbientTenantId()).toBeUndefined();
    });
  });

  it('reports an unavailable context instead of silently doing nothing', () => {
    // `requestContext.set` no-ops with no active store. A silent no-op here is
    // the bug this lib exists to prevent: downstream readers would see no
    // tenant and, under fail-closed RLS, return zero rows rather than error.
    const failure = setAmbientTenantId(tenantA);

    expect(failure?.code).toBe('tenant_context_unavailable');
    expect(getAmbientTenantId()).toBeUndefined();
  });
});

describe('requireAmbientTenantId', () => {
  it('returns the ambient tenant', () => {
    requestContext.run(() => {
      setAmbientTenantId(tenantA);
      expect(requireAmbientTenantId()).toBe(tenantA);
    });
  });

  it('throws when no tenant is established', () => {
    requestContext.run(() => {
      expect(() => requireAmbientTenantId()).toThrow(/No ambient tenant is established/u);
    });
  });
});

describe('withAmbientTenant', () => {
  it('creates a store when none is active', () => {
    expect(requestContext.isAvailable()).toBe(false);

    const seen = withAmbientTenant(tenantA, () => getAmbientTenantId());

    expect(seen).toBe(tenantA);
    expect(getAmbientTenantId()).toBeUndefined();
  });

  it('reuses an active store and restores nothing implicitly', () => {
    requestContext.run(() => {
      setAmbientTenantId(tenantA);
      const seen = withAmbientTenant(tenantB, () => getAmbientTenantId());

      expect(seen).toBe(tenantB);
      // Same store, so the override persists — callers that need isolation must
      // start their own store. Pinned so the behaviour is a decision, not a
      // surprise.
      expect(getAmbientTenantId()).toBe(tenantB);
    });
  });

  it('rejects an invalid tenant id before running the work', () => {
    let ran = false;

    expect(() => {
      withAmbientTenant('not-a-uuid', () => {
        ran = true;
      });
    }).toThrow(/not a UUID/u);
    expect(ran).toBe(false);
  });

  it('propagates the work result and its errors', () => {
    expect(withAmbientTenant(DefaultTenantId, () => 42)).toBe(42);
    expect(() =>
      withAmbientTenant(DefaultTenantId, () => {
        throw new Error('work failed');
      }),
    ).toThrow('work failed');
  });

  it('keeps the ambient tenant across an await boundary', async () => {
    const seen = await withAmbientTenant(tenantA, async () => {
      await Promise.resolve();
      return getAmbientTenantId();
    });

    expect(seen).toBe(tenantA);
  });
});
