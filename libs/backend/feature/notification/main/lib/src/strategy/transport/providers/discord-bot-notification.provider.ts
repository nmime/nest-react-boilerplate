import { Injectable, Logger } from '@nestjs/common';
import { NotificationDeliveryProvider, NotificationErrorReason, NotificationStatus } from '@app/common-notifications';
import { NotificationConfigService } from '../../../config';
import {
  type NotificationProviderSendInput,
  type NotificationProviderSendResult,
  NotificationProviderStrategy,
} from '../notification-provider.strategy';

const discordApiBase = 'https://discord.com/api/v10';

@Injectable()
export class DiscordBotNotificationProvider extends NotificationProviderStrategy {
  readonly provider = NotificationDeliveryProvider.DiscordBot;
  private readonly logger = new Logger(DiscordBotNotificationProvider.name);

  constructor(private readonly config: NotificationConfigService) {
    super();
  }

  override readiness() {
    return { provider: this.provider, configured: Boolean(this.config.discordBotToken) };
  }

  async send(input: NotificationProviderSendInput): Promise<NotificationProviderSendResult> {
    if (input.message.kind !== 'bot') {
      return {
        status: NotificationStatus.Error,
        errorReason: NotificationErrorReason.UnsupportedChannel,
        errorMessage: 'Discord Bot accepts only bot-channel messages.',
      };
    }
    const token = this.config.discordBotToken;
    if (!token) {
      return {
        status: NotificationStatus.Error,
        errorReason: NotificationErrorReason.ProviderConfiguration,
        errorMessage: 'DISCORD_BOT_TOKEN is required for Discord notification delivery.',
      };
    }

    if (input.message.text.length === 0 || input.message.text.length > 2000) {
      return invalidMessage('Discord message content must contain 1 to 2000 characters.');
    }
    const payload = discordMessagePayload(input.message, input.extra?.disableNotification ?? false);
    if ('error' in payload && typeof payload.error === 'string') {
      return invalidMessage(payload.error);
    }

    let channelResponse: Response;
    try {
      channelResponse = await this.request(token, '/users/@me/channels', { recipient_id: input.address }, input.signal);
    } catch (error) {
      return this.networkFailure(error);
    }
    if (!channelResponse.ok) {
      return this.mapError(channelResponse, await discordError(channelResponse));
    }
    let channel: { id?: string };
    try {
      channel = (await channelResponse.json()) as { id?: string };
    } catch (error) {
      return this.networkFailure(error);
    }
    if (!channel.id) {
      return {
        status: NotificationStatus.Error,
        errorReason: NotificationErrorReason.UnknownError,
        errorMessage: 'Discord did not return a DM channel id.',
      };
    }

    await this.beginDispatch(input);
    try {
      const messageResponse = await this.request(token, `/channels/${channel.id}/messages`, payload, input.signal);
      if (messageResponse.ok) {
        return { status: NotificationStatus.Sent };
      }
      return this.mapError(messageResponse, await discordError(messageResponse));
    } catch (error) {
      return this.networkFailure(error);
    }
  }

  private networkFailure(error: unknown): NotificationProviderSendResult {
    this.logger.warn(`Discord notification request failed: ${toSafeErrorMessage(error)}`);
    return {
      status: NotificationStatus.Pending,
      errorReason: NotificationErrorReason.NetworkError,
      errorMessage: toSafeErrorMessage(error),
    };
  }

  private request(token: string, path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    return fetch(`${discordApiBase}${path}`, {
      method: 'POST',
      signal,
      headers: { authorization: `Bot ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private mapError(response: Response, error: DiscordError): NotificationProviderSendResult {
    if (response.status === 429) {
      return {
        status: NotificationStatus.Pending,
        errorReason: NotificationErrorReason.RateLimit,
        errorMessage: error.message,
        retryAfterSeconds: error.retryAfterSeconds ?? retryAfterHeader(response),
      };
    }
    if (response.status >= 500) {
      return {
        status: NotificationStatus.Pending,
        errorReason: NotificationErrorReason.BadGateway,
        errorMessage: error.message,
      };
    }
    if (response.status === 403 || response.status === 404) {
      return {
        status: NotificationStatus.Rejected,
        errorReason: NotificationErrorReason.InvalidRecipient,
        errorMessage: error.message,
      };
    }
    return {
      status: NotificationStatus.Rejected,
      errorReason: NotificationErrorReason.ProviderRejected,
      errorMessage: error.message,
    };
  }
}

interface DiscordError {
  message?: string;
  retryAfterSeconds?: number;
}

async function discordError(response: Response): Promise<DiscordError> {
  const body = (await response.json().catch(() => ({}))) as { message?: unknown; retry_after?: unknown };
  return {
    ...(typeof body.message === 'string' ? { message: body.message.slice(0, 500) } : {}),
    ...(typeof body.retry_after === 'number' ? { retryAfterSeconds: Math.ceil(body.retry_after) } : {}),
  };
}

function toSafeErrorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: request failed` : 'Network request failed.';
}

function discordMessagePayload(
  message: Extract<NotificationProviderSendInput['message'], { kind: 'bot' }>,
  silent: boolean,
): Record<string, unknown> | { error: string } {
  if ((message.buttons?.length ?? 0) > 5) {
    return { error: 'Discord supports at most 5 action rows.' };
  }
  const components: Array<Record<string, unknown>> = [];
  for (const row of message.buttons ?? []) {
    const result = discordActionRow(row);
    if ('error' in result) {
      return result;
    }
    components.push(result.component);
  }
  const imageError = message.image ? validateHttpsUrl(message.image, 'Discord embed image') : undefined;
  if (imageError) {
    return { error: imageError };
  }
  return {
    content: message.text,
    allowed_mentions: { parse: [] },
    ...(message.image ? { embeds: [{ image: { url: message.image } }] } : {}),
    ...(components.length > 0 ? { components } : {}),
    ...(silent ? { flags: 1 << 12 } : {}),
  };
}

type DiscordButton = NonNullable<
  Extract<NotificationProviderSendInput['message'], { kind: 'bot' }>['buttons']
>[number][number];

function discordActionRow(row: DiscordButton[]): { component: Record<string, unknown> } | { error: string } {
  if (row.length === 0 || row.length > 5) {
    return { error: 'Discord action rows must contain 1 to 5 buttons.' };
  }
  const buttons: Array<Record<string, unknown>> = [];
  for (const button of row) {
    const result = discordButton(button);
    if ('error' in result) {
      return result;
    }
    buttons.push(result.component);
  }
  return { component: { type: 1, components: buttons } };
}

function discordButton(button: DiscordButton): { component: Record<string, unknown> } | { error: string } {
  if (!button.text.trim() || button.text.length > 80) {
    return { error: 'Discord button labels must contain 1 to 80 characters.' };
  }
  if (button.webApp !== undefined || button.switchInlineQuery !== undefined) {
    return { error: 'Discord buttons do not support Telegram web-app or inline-query actions.' };
  }
  if (Boolean(button.url) === Boolean(button.callback)) {
    return { error: 'Discord buttons require exactly one action.' };
  }
  if (button.url) {
    const error = validateHttpsUrl(button.url, 'Discord link button');
    return error ? { error } : { component: { type: 2, style: 5, label: button.text, url: button.url } };
  }
  if (!button.callback || Buffer.byteLength(button.callback, 'utf8') > 100) {
    return { error: 'Discord callback actions must not exceed 100 bytes.' };
  }
  return { component: { type: 2, style: 1, label: button.text, custom_id: button.callback } };
}

function validateHttpsUrl(value: string, label: string): string | undefined {
  try {
    return new URL(value).protocol === 'https:' ? undefined : `${label} requires HTTPS.`;
  } catch {
    return `${label} URL is invalid.`;
  }
}

function invalidMessage(message: string): NotificationProviderSendResult {
  return {
    status: NotificationStatus.Error,
    errorReason: NotificationErrorReason.InvalidMessage,
    errorMessage: message,
  };
}

function retryAfterHeader(response: Response): number | undefined {
  const value = Number(response.headers.get('retry-after'));
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : undefined;
}
