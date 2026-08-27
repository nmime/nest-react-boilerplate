// @requirements REQ-PAYMENT-PROVIDER-004
import { describe, expect, it } from 'vitest';
import type {
  PaymentProviderHealthRecord,
  UpsertPaymentProviderHealthParams,
} from '@app/backend-feature-payments-shared';
import { ProviderHealthService } from './provider-health.service';

const Start = new Date('2026-08-27T00:00:00.000Z');

function createHarness(initial?: PaymentProviderHealthRecord) {
  let health = initial ?? null;
  const persistence = {
    findPaymentProviderHealth: async () => health,
    upsertPaymentProviderHealth: async (input: UpsertPaymentProviderHealthParams) => {
      const previous = health;
      health = {
        providerCode: input.providerCode,
        state: input.state,
        consecutiveErrors: input.consecutiveErrors,
        lastSuccessAt: input.lastSuccessAt === undefined ? (previous?.lastSuccessAt ?? null) : input.lastSuccessAt,
        lastErrorAt: input.lastErrorAt === undefined ? (previous?.lastErrorAt ?? null) : input.lastErrorAt,
        lastErrorClass: input.lastErrorClass === undefined ? (previous?.lastErrorClass ?? null) : input.lastErrorClass,
        updatedAt: input.updatedAt ?? Start,
      };
      return health;
    },
  };
  return { service: new ProviderHealthService(persistence as never), current: () => health };
}

describe('ProviderHealthService', () => {
  it('returns unknown without fabricating a database write', async () => {
    const { service, current } = createHarness();

    await expect(service.get('alpha', Start)).resolves.toEqual({
      providerCode: 'alpha',
      state: 'unknown',
      consecutiveErrors: 0,
      lastSuccessAt: null,
      lastErrorAt: null,
      lastErrorClass: null,
      updatedAt: Start,
    });
    expect(current()).toBeNull();
  });

  it('success resets errors and raises an active provider to up', async () => {
    const { service } = createHarness({
      providerCode: 'alpha',
      state: 'degraded',
      consecutiveErrors: 3,
      lastSuccessAt: null,
      lastErrorAt: Start,
      lastErrorClass: 'server',
      updatedAt: Start,
    });
    const recoveredAt = new Date(Start.getTime() + 1_000);

    await expect(service.recordSuccess('alpha', recoveredAt)).resolves.toMatchObject({
      state: 'up',
      consecutiveErrors: 0,
      lastSuccessAt: recoveredAt,
    });
  });

  it('success never turns an administratively disabled provider back on', async () => {
    const { service } = createHarness({
      providerCode: 'alpha',
      state: 'disabled',
      consecutiveErrors: 1,
      lastSuccessAt: null,
      lastErrorAt: Start,
      lastErrorClass: 'network',
      updatedAt: Start,
    });

    await expect(service.recordSuccess('alpha', Start)).resolves.toMatchObject({
      state: 'disabled',
      consecutiveErrors: 0,
    });
  });

  it('degrades on the second consecutive server or timeout error and remains routable', async () => {
    const { service } = createHarness();

    await expect(service.recordError('alpha', 'server', Start)).resolves.toMatchObject({
      state: 'unknown',
      consecutiveErrors: 1,
    });
    await expect(service.recordError('alpha', 'timeout', new Date(Start.getTime() + 1_000))).resolves.toMatchObject({
      state: 'degraded',
      consecutiveErrors: 2,
      lastErrorClass: 'timeout',
    });
  });

  it('does not degrade on a mixed client/server pair', async () => {
    const { service } = createHarness();

    await service.recordError('alpha', 'client', Start);
    await expect(service.recordError('alpha', 'server', new Date(Start.getTime() + 1_000))).resolves.toMatchObject({
      state: 'unknown',
      consecutiveErrors: 2,
    });
  });

  it('downs immediately on auth and stays down until a success', async () => {
    const { service } = createHarness();

    await expect(service.recordError('alpha', 'auth', Start)).resolves.toMatchObject({ state: 'down' });
    await expect(service.recordError('alpha', 'client', new Date(Start.getTime() + 1_000))).resolves.toMatchObject({
      state: 'down',
    });
  });

  it('downs on the fifth error inside ten minutes', async () => {
    const { service } = createHarness();

    /* eslint-disable no-await-in-loop */
    for (let index = 0; index < 4; index += 1) {
      await service.recordError('alpha', 'network', new Date(Start.getTime() + index * 60_000));
    }
    /* eslint-enable no-await-in-loop */
    await expect(
      service.recordError('alpha', 'rate_limited', new Date(Start.getTime() + 4 * 60_000)),
    ).resolves.toMatchObject({
      state: 'down',
      consecutiveErrors: 5,
    });
  });

  it('starts a fresh count after the ten-minute evidence window', async () => {
    const { service } = createHarness({
      providerCode: 'alpha',
      state: 'up',
      consecutiveErrors: 4,
      lastSuccessAt: Start,
      lastErrorAt: Start,
      lastErrorClass: 'network',
      updatedAt: Start,
    });

    await expect(
      service.recordError('alpha', 'network', new Date(Start.getTime() + 10 * 60_000 + 1)),
    ).resolves.toMatchObject({
      state: 'up',
      consecutiveErrors: 1,
    });
  });

  it('keeps disabled as the dominant state while still recording evidence', async () => {
    const { service } = createHarness({
      providerCode: 'alpha',
      state: 'disabled',
      consecutiveErrors: 0,
      lastSuccessAt: null,
      lastErrorAt: null,
      lastErrorClass: null,
      updatedAt: Start,
    });

    await expect(service.recordError('alpha', 'auth', Start)).resolves.toMatchObject({
      state: 'disabled',
      consecutiveErrors: 1,
      lastErrorClass: 'auth',
    });
  });

  it('sets and clears the administrative disabled state explicitly', async () => {
    const { service } = createHarness();

    await expect(service.setDisabled('alpha', true, Start)).resolves.toMatchObject({
      state: 'disabled',
      consecutiveErrors: 0,
    });
    await expect(service.setDisabled('alpha', false, new Date(Start.getTime() + 1))).resolves.toMatchObject({
      state: 'unknown',
      consecutiveErrors: 0,
      lastErrorAt: null,
      lastErrorClass: null,
    });
  });
});
