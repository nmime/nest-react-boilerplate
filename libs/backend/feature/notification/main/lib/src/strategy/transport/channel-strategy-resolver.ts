import { Injectable } from '@nestjs/common';
import { NotificationChannel, type NotificationDeliveryChannel } from '@app/common-notifications';
import { BotChannelStrategy } from './bot-channel.strategy';

@Injectable()
export class ChannelStrategyResolver {
  constructor(private readonly botChannelStrategy: BotChannelStrategy) {}

  resolve(channel: NotificationDeliveryChannel): BotChannelStrategy | undefined {
    if (channel === NotificationChannel.Bot) {
      return this.botChannelStrategy;
    }
    return undefined;
  }
}
