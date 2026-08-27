import { Exception, ExceptionKind } from '@app/backend-common-exception';
import { type ProviderHttpError, registerPaymentProblemTypes } from '@app/backend-feature-payments-shared';

// Product problem types must exist before the exception factory evaluates the
// class definitions below. Every backend process loads this file once through
// PaymentsMainModule.
registerPaymentProblemTypes();

export class PaymentProviderUnavailableException extends Exception({
  name: 'PaymentProviderUnavailableException',
  kind: ExceptionKind.Server,
  problemType: 'payment-provider-unavailable',
}) {}

export class PaymentProviderRateLimitedException extends Exception({
  name: 'PaymentProviderRateLimitedException',
  kind: ExceptionKind.Server,
  problemType: 'payment-provider-rate-limited',
}) {}

export class PaymentProviderCredentialInvalidException extends Exception({
  name: 'PaymentProviderCredentialInvalidException',
  kind: ExceptionKind.Server,
  problemType: 'payment-provider-credential-invalid',
}) {}

export class PaymentProviderCapabilityException extends Exception({
  name: 'PaymentProviderCapabilityException',
  kind: ExceptionKind.Server,
  problemType: 'payment-provider-capability',
}) {}

/** Converts the normalized provider failure into the public RFC 9457 exception. */
export function providerProblemFromHttpError(error: ProviderHttpError): Error {
  const context = {
    meta: {
      providerErrorClass: error.class,
      providerStatus: error.providerStatus,
      providerProblemType: error.problemType,
    },
    cause: error,
  };

  if (error.class === 'auth') {
    return new PaymentProviderCredentialInvalidException(context);
  }
  if (error.class === 'rate_limited') {
    return new PaymentProviderRateLimitedException({
      ...context,
      ...(error.retryAfterSeconds === undefined ? {} : { extensions: { retryAfterSeconds: error.retryAfterSeconds } }),
    });
  }
  if (error.class === 'client') {
    return new PaymentProviderCapabilityException(context);
  }
  return new PaymentProviderUnavailableException(context);
}
