import { importPKCS8, SignJWT } from 'jose';
import { Injectable, Logger } from '@nestjs/common';
import { NotificationDeliveryProvider, NotificationErrorReason, NotificationStatus } from '@app/common-notifications';
import { NotificationConfigService } from '../../../config';
import {
  type NotificationProviderSendInput,
  type NotificationProviderSendResult,
  NotificationProviderStrategy,
} from '../notification-provider.strategy';

const firebaseMessagingScope = 'https://www.googleapis.com/auth/firebase.messaging';

@Injectable()
export class GoogleFcmNotificationProvider extends NotificationProviderStrategy {
  readonly provider = NotificationDeliveryProvider.GoogleFcm;
  private readonly logger = new Logger(GoogleFcmNotificationProvider.name);
  private cachedToken?: { value: string; expiresAt: number };

  constructor(private readonly config: NotificationConfigService) {
    super();
  }

  override readiness() {
    const { projectId, clientEmail, privateKey, tokenUri } = this.config.googleFcm;
    return {
      provider: this.provider,
      configured: Boolean(projectId && clientEmail && privateKey && tokenUri),
    };
  }

  async send(input: NotificationProviderSendInput): Promise<NotificationProviderSendResult> {
    if (input.message.kind !== 'push') {
      return unsupportedPush();
    }
    const config = this.config.googleFcm;
    if (!config.projectId || !config.clientEmail || !config.privateKey || !config.tokenUri) {
      return configurationError('FCM project id, client email, private key, and token URI are required.');
    }
    if (!input.address.trim() || input.address.length > 4096) {
      return invalidPush('FCM device token is invalid.');
    }
    const body = JSON.stringify({
      message: {
        token: input.address,
        notification: {
          title: input.message.subject,
          body: input.message.text,
          ...(input.message.image ? { image: input.message.image } : {}),
        },
        data: {
          notification_delivery_id: input.deliveryId,
          ...(input.message.actions ? { actions: JSON.stringify(input.message.actions) } : {}),
        },
        android: { priority: input.extra?.disableNotification ? 'normal' : 'high' },
      },
    });
    let token: string;
    try {
      token = await this.accessToken(config, input.signal);
    } catch (error) {
      return this.networkFailure(error);
    }

    await this.beginDispatch(input);
    try {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/messages:send`,
        {
          method: 'POST',
          signal: input.signal,
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body,
        },
      );
      if (response.ok) {
        return { status: NotificationStatus.Sent };
      }
      const error = await fcmError(response);
      if (response.status === 429) {
        return {
          status: NotificationStatus.Pending,
          errorReason: NotificationErrorReason.RateLimit,
          errorMessage: error.message,
          retryAfterSeconds: retryAfterSeconds(response),
        };
      }
      if (response.status >= 500) {
        return {
          status: NotificationStatus.Pending,
          errorReason: NotificationErrorReason.BadGateway,
          errorMessage: error.message,
        };
      }
      if (error.status === 'UNREGISTERED' || error.status === 'NOT_FOUND' || response.status === 404) {
        return {
          status: NotificationStatus.Rejected,
          errorReason: NotificationErrorReason.InvalidRecipient,
          errorMessage: error.message,
        };
      }
      if (response.status === 401 || response.status === 403) {
        this.cachedToken = undefined;
        return configurationError(error.message ?? 'FCM credentials were rejected.');
      }
      return {
        status: NotificationStatus.Rejected,
        errorReason: NotificationErrorReason.ProviderRejected,
        errorMessage: error.message,
      };
    } catch (error) {
      return this.networkFailure(error);
    }
  }

  private networkFailure(error: unknown): NotificationProviderSendResult {
    this.logger.warn(`FCM notification request failed: ${safeNetworkError(error)}`);
    return {
      status: NotificationStatus.Pending,
      errorReason: NotificationErrorReason.NetworkError,
      errorMessage: safeNetworkError(error),
    };
  }

  private async accessToken(config: NotificationConfigService['googleFcm'], signal?: AbortSignal): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60_000) {
      return this.cachedToken.value;
    }
    const key = await importPKCS8(config.privateKey, 'RS256');
    const assertion = await new SignJWT({ scope: firebaseMessagingScope })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(config.clientEmail)
      .setAudience(config.tokenUri)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);
    const response = await fetch(config.tokenUri, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { access_token?: unknown; expires_in?: unknown };
    if (!response.ok || typeof body.access_token !== 'string') {
      throw new Error('FCM OAuth token request failed.');
    }
    const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 3600;
    this.cachedToken = { value: body.access_token, expiresAt: Date.now() + expiresIn * 1000 };
    return body.access_token;
  }
}

interface FcmError {
  message?: string;
  status?: string;
}

async function fcmError(response: Response): Promise<FcmError> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: unknown; status?: unknown; details?: Array<{ errorCode?: unknown }> };
  };
  const detailCode = body.error?.details?.find((detail) => typeof detail.errorCode === 'string')?.errorCode;
  let status: string | undefined;
  if (typeof detailCode === 'string') {
    status = detailCode;
  } else if (typeof body.error?.status === 'string') {
    status = body.error.status;
  }
  return {
    ...(typeof body.error?.message === 'string' ? { message: body.error.message.slice(0, 500) } : {}),
    ...(status ? { status } : {}),
  };
}

function unsupportedPush(): NotificationProviderSendResult {
  return {
    status: NotificationStatus.Error,
    errorReason: NotificationErrorReason.UnsupportedChannel,
    errorMessage: 'Push provider accepts only push-channel messages.',
  };
}

function invalidPush(message: string): NotificationProviderSendResult {
  return {
    status: NotificationStatus.Error,
    errorReason: NotificationErrorReason.InvalidMessage,
    errorMessage: message,
  };
}

function configurationError(message: string): NotificationProviderSendResult {
  return {
    status: NotificationStatus.Error,
    errorReason: NotificationErrorReason.ProviderConfiguration,
    errorMessage: message,
  };
}

function retryAfterSeconds(response: Response): number | undefined {
  const value = Number(response.headers.get('retry-after'));
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : undefined;
}

function safeNetworkError(error: unknown): string {
  return error instanceof Error ? `${error.name}: request failed` : 'Network request failed.';
}

export { configurationError as pushConfigurationError, invalidPush, unsupportedPush };
