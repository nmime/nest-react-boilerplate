import { Injectable } from '@nestjs/common';
import { NotificationChannel } from '@app/backend-postgres-main-notification';
import { BotChannelStrategy } from './bot-channel.strategy';

@Injectable()
export class ChannelStrategyResolver {
  constructor(private readonly botChannelStrategy: BotChannelStrategy) {}

  resolve(channel: NotificationChannel): BotChannelStrategy | undefined {
    if (channel === NotificationChannel.Bot) {
      return this.botChannelStrategy;
    }
    return undefined;
  }
}
