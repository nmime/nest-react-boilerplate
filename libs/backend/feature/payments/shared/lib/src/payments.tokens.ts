import type { PaymentProviderPort } from './payment-provider.port';

/**
 * The registry of every registered provider adapter, keyed by
 * `payment_providers.code`.
 */

/**
 * Multi-provider injection token (design §4.0).
 *
 * A Symbol rather than a class token because the registry is one `Map`
 * holding N adapters and Nest resolves a class token to exactly one provider
 * — the same rationale as fiat-currency's `FiatRateSourcesInjectToken`. The
 * `useFactory` binding (U5) injects every `PaymentProviderPort` provider and
 * builds the map.
 */
export const PaymentProvidersInjectToken = Symbol('PaymentProvidersInjectToken');

export type PaymentProviderRegistry = Map<string, PaymentProviderPort>;
