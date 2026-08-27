// @requirements REQ-PAYMENT-PROVIDER-003
import { describe, expect, it } from 'vitest';
import { ProviderHttpError } from '@app/backend-feature-payments-shared';
import {
  PaymentProviderCapabilityException,
  PaymentProviderCredentialInvalidException,
  PaymentProviderRateLimitedException,
  PaymentProviderUnavailableException,
  providerProblemFromHttpError,
} from './provider-errors';

describe('provider problem exceptions', () => {
  it.each([
    ['auth', PaymentProviderCredentialInvalidException, 'payment-provider-credential-invalid'],
    ['client', PaymentProviderCapabilityException, 'payment-provider-capability'],
    ['server', PaymentProviderUnavailableException, 'payment-provider-unavailable'],
    ['timeout', PaymentProviderUnavailableException, 'payment-provider-unavailable'],
    ['network', PaymentProviderUnavailableException, 'payment-provider-unavailable'],
  ] as const)('maps %s failures to a fail-closed problem', (errorClass, Expected, code) => {
    const source = new ProviderHttpError(errorClass, 'private provider detail', {
      providerStatus: 503,
      problemType: code,
      retryable: errorClass !== 'auth' && errorClass !== 'client',
    });
    const mapped = providerProblemFromHttpError(source);

    expect(mapped).toBeInstanceOf(Expected);
    expect((mapped as InstanceType<typeof Expected>).toProblemDetails()).toMatchObject({ status: 503, code });
    expect((mapped as InstanceType<typeof Expected>).meta).toEqual({
      providerErrorClass: errorClass,
      providerStatus: 503,
      providerProblemType: code,
    });
    expect((mapped as InstanceType<typeof Expected>).cause).toBe(source);
  });

  it('publishes retryAfterSeconds for an exhausted provider rate limit', () => {
    const mapped = providerProblemFromHttpError(
      new ProviderHttpError('rate_limited', 'slow down', {
        providerStatus: 429,
        retryable: true,
        retryAfterSeconds: 7,
      }),
    ) as PaymentProviderRateLimitedException;

    expect(mapped.toProblemDetails()).toMatchObject({
      status: 503,
      code: 'payment-provider-rate-limited',
      retryAfterSeconds: 7,
    });
  });

  it('omits the optional retry extension when the provider supplied no delay', () => {
    const mapped = providerProblemFromHttpError(
      new ProviderHttpError('rate_limited', 'slow down', { providerStatus: 429, retryable: true }),
    ) as PaymentProviderRateLimitedException;

    expect(mapped.toProblemDetails()).not.toHaveProperty('retryAfterSeconds');
  });
});
