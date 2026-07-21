import { connect, constants, type ClientHttp2Session } from 'node:http2';
import type { IncomingHttpHeaders } from 'node:http';
import { importPKCS8, SignJWT } from 'jose';
import { Injectable, Logger } from '@nestjs/common';
import { NotificationDeliveryProvider, NotificationErrorReason, NotificationStatus } from '@app/common-notifications';
import { NotificationConfigService } from '../../../config';
import {
  type NotificationProviderSendInput,
  type NotificationProviderSendResult,
  NotificationProviderStrategy,
} from '../notification-provider.strategy';
import { invalidPush, pushConfigurationError, unsupportedPush } from './google-fcm-notification.provider';

@Injectable()
export class AppleApnsNotificationProvider extends NotificationProviderStrategy {
  readonly provider = NotificationDeliveryProvider.AppleApns;
  private readonly logger = new Logger(AppleApnsNotificationProvider.name);
  private cachedToken?: { value: string; expiresAt: number };

  constructor(private readonly config: NotificationConfigService) {
    super();
  }

  async send(input: NotificationProviderSendInput): Promise<NotificationProviderSendResult> {
    if (input.message.kind !== 'push') {
      return unsupportedPush();
    }
    const config = this.config.appleApns;
    if (!config.teamId || !config.keyId || !config.bundleId || !config.privateKey) {
      return pushConfigurationError('APNs team id, key id, bundle id, and private key are required.');
    }
    if (!/^[a-fA-F0-9]{32,200}$/u.test(input.address)) {
      return invalidPush('APNs device token is invalid.');
    }
    const payload = JSON.stringify({
      aps: {
        alert: { title: input.message.subject, body: input.message.text },
        ...(input.extra?.disableNotification ? {} : { sound: 'default' }),
        'mutable-content': input.message.image ? 1 : 0,
      },
      notification_delivery_id: input.deliveryId,
      ...(input.message.image ? { image: input.message.image } : {}),
      ...(input.message.actions ? { actions: input.message.actions } : {}),
    });
    if (Buffer.byteLength(payload) > 4096) {
      return invalidPush('APNs payload exceeds 4096 bytes.');
    }
    try {
      const token = await this.providerToken(config);
      const authority = config.sandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
      const response = await requestApns(authority, input.address, payload, {
        authorization: `bearer ${token}`,
        'apns-topic': config.bundleId,
        'apns-push-type': 'alert',
        'apns-priority': input.extra?.disableNotification ? '5' : '10',
      });
      if (response.status === 403) {
        this.cachedToken = undefined;
      }
      return mapApnsResponse(response);
    } catch (error) {
      this.logger.warn(`APNs notification request failed: ${safeNetworkError(error)}`);
      return {
        status: NotificationStatus.Pending,
        errorReason: NotificationErrorReason.NetworkError,
        errorMessage: safeNetworkError(error),
      };
    }
  }

  private async providerToken(config: NotificationConfigService['appleApns']): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.value;
    }
    const key = await importPKCS8(config.privateKey, 'ES256');
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: config.keyId })
      .setIssuer(config.teamId)
      .setIssuedAt()
      .sign(key);
    this.cachedToken = { value: token, expiresAt: Date.now() + 50 * 60 * 1000 };
    return token;
  }
}

interface ApnsResponse {
  status: number;
  reason?: string;
  retryAfterSeconds?: number;
}

function mapApnsResponse(response: ApnsResponse): NotificationProviderSendResult {
  if (response.status === 200) {
    return { status: NotificationStatus.Sent };
  }
  if (response.status === 429) {
    return {
      status: NotificationStatus.Pending,
      errorReason: NotificationErrorReason.RateLimit,
      errorMessage: response.reason,
      retryAfterSeconds: response.retryAfterSeconds,
    };
  }
  if (response.status >= 500) {
    return {
      status: NotificationStatus.Pending,
      errorReason: NotificationErrorReason.BadGateway,
      errorMessage: response.reason,
    };
  }
  const invalidRecipientReasons = ['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered'];
  if (response.status === 410 || invalidRecipientReasons.includes(response.reason ?? '')) {
    return {
      status: NotificationStatus.Rejected,
      errorReason: NotificationErrorReason.InvalidRecipient,
      errorMessage: response.reason,
    };
  }
  if (response.status === 403) {
    return pushConfigurationError(response.reason ?? 'APNs credentials were rejected.');
  }
  return {
    status: NotificationStatus.Rejected,
    errorReason: NotificationErrorReason.ProviderRejected,
    errorMessage: response.reason,
  };
}

function requestApns(
  authority: string,
  deviceToken: string,
  payload: string,
  headers: Record<string, string>,
): Promise<ApnsResponse> {
  return new Promise((resolve, reject) => {
    const session: ClientHttp2Session = connect(authority);
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      session.close();
      action();
    };
    session.once('error', (error) => {
      finish(() => {
        reject(asError(error));
      });
    });
    const request = session.request({
      [constants.HTTP2_HEADER_METHOD]: 'POST',
      [constants.HTTP2_HEADER_PATH]: `/3/device/${deviceToken}`,
      ...headers,
    });
    let responseHeaders: IncomingHttpHeaders = {};
    const chunks: Buffer[] = [];
    request.on('response', (received) => {
      responseHeaders = received;
    });
    request.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.on('error', (error) => {
      finish(() => {
        reject(asError(error));
      });
    });
    request.on('end', () => {
      const status = Number(responseHeaders[constants.HTTP2_HEADER_STATUS] ?? 500);
      const body = parseReason(Buffer.concat(chunks).toString('utf8'));
      const retryAfter = Number(responseHeaders['retry-after']);
      finish(() => {
        resolve({
          status,
          ...(body ? { reason: body } : {}),
          ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterSeconds: Math.ceil(retryAfter) } : {}),
        });
      });
    });
    request.end(payload);
  });
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('APNs HTTP/2 request failed.');
}

function parseReason(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { reason?: unknown };
    return typeof parsed.reason === 'string' ? parsed.reason.slice(0, 500) : undefined;
  } catch {
    return undefined;
  }
}

function safeNetworkError(error: unknown): string {
  return error instanceof Error ? `${error.name}: request failed` : 'Network request failed.';
}
