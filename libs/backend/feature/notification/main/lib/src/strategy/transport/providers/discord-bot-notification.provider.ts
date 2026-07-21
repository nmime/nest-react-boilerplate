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

    try {
      const channelResponse = await this.request(token, '/users/@me/channels', { recipient_id: input.address });
      if (!channelResponse.ok) {
        return this.mapError(channelResponse.status, await discordErrorMessage(channelResponse));
      }
      const channel = (await channelResponse.json()) as { id?: string };
      if (!channel.id) {
        return {
          status: NotificationStatus.Error,
          errorReason: NotificationErrorReason.UnknownError,
          errorMessage: 'Discord did not return a DM channel id.',
        };
      }
      const content = input.message.image ? `${input.message.text}\n${input.message.image}` : input.message.text;
      const messageResponse = await this.request(token, `/channels/${channel.id}/messages`, { content });
      if (messageResponse.ok) {
        return { status: NotificationStatus.Sent };
      }
      return this.mapError(messageResponse.status, await discordErrorMessage(messageResponse));
    } catch (error) {
      this.logger.warn(`Discord notification request failed: ${toSafeErrorMessage(error)}`);
      return {
        status: NotificationStatus.Pending,
        errorReason: NotificationErrorReason.NetworkError,
        errorMessage: toSafeErrorMessage(error),
      };
    }
  }

  private request(token: string, path: string, body: Record<string, string>): Promise<Response> {
    return fetch(`${discordApiBase}${path}`, {
      method: 'POST',
      headers: { authorization: `Bot ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private mapError(status: number, message: string | undefined): NotificationProviderSendResult {
    if (status === 429) {
      return {
        status: NotificationStatus.Pending,
        errorReason: NotificationErrorReason.RateLimit,
        errorMessage: message,
      };
    }
    if (status >= 500) {
      return {
        status: NotificationStatus.Pending,
        errorReason: NotificationErrorReason.BadGateway,
        errorMessage: message,
      };
    }
    if (status === 403 || status === 404) {
      return {
        status: NotificationStatus.Rejected,
        errorReason: NotificationErrorReason.InvalidRecipient,
        errorMessage: message,
      };
    }
    return {
      status: NotificationStatus.Rejected,
      errorReason: NotificationErrorReason.ProviderRejected,
      errorMessage: message,
    };
  }
}

async function discordErrorMessage(response: Response): Promise<string | undefined> {
  const body = (await response.json().catch(() => ({}))) as { message?: unknown };
  return typeof body.message === 'string' ? body.message.slice(0, 500) : undefined;
}

function toSafeErrorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: request failed` : 'Network request failed.';
}
