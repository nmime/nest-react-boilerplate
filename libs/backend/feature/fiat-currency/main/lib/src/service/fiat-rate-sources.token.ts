/**
 * Multi-provider token for the rate providers a product registers.
 *
 * A token rather than the {@link FiatRateSource} class itself because there can be several: a
 * central-bank feed for the majors and a commercial one for the rest is the normal arrangement,
 * and Nest resolves a class token to exactly one provider.
 */
export const FiatRateSourcesInjectToken = Symbol('FiatRateSourcesInjectToken');
