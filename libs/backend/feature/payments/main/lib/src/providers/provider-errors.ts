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

export class WebhookSignatureInvalidException extends Exception({
  name: 'WebhookSignatureInvalidException',
  kind: ExceptionKind.Client,
  problemType: 'webhook-signature-invalid',
}) {}

export class WebhookReplayedException extends Exception({
  name: 'WebhookReplayedException',
  kind: ExceptionKind.Client,
  problemType: 'webhook-replayed',
}) {}

export class WebhookStaleException extends Exception({
  name: 'WebhookStaleException',
  kind: ExceptionKind.Client,
  problemType: 'webhook-stale',
}) {}

export class WebhookProcessingException extends Exception({
  name: 'WebhookProcessingException',
  kind: ExceptionKind.Server,
  problemType: 'webhook-processing-error',
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
