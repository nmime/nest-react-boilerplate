import { describe, it, expect, beforeEach } from 'vitest';
import {
  BotChannelStrategy,
  type MassSenderMessage,
} from './bot-channel.strategy';
import { NotificationErrorReason, NotificationStatus } from '@app/backend-postgres-main-notification';

describe(BotChannelStrategy.name, () => {
  let strategy: BotChannelStrategy;

  beforeEach(() => {
    strategy = new BotChannelStrategy();
  });

  describe('send', () => {
    it('should return Sent status for valid message', async () => {
      const result = await strategy.send({
        telegramId: '12345',
        message: { text: 'Hello' },
      });

      expect(result.status).toBe(NotificationStatus.Sent);
    });

    it('should handle message with image', async () => {
      const result = await strategy.send({
        telegramId: '12345',
        message: { text: 'Hello', image: 'https://example.com/img.png' },
      });

      expect(result.status).toBe(NotificationStatus.Sent);
    });

    it('should handle message with buttons', async () => {
      const message: MassSenderMessage = {
        text: 'Hello',
        buttons: [[{ text: 'Click', callback: 'cb_1' }]],
      };
      const result = await strategy.send({
        telegramId: '12345',
        message,
      });

      expect(result.status).toBe(NotificationStatus.Sent);
    });

    it('should handle silent notification with extra', async () => {
      const result = await strategy.send({
        telegramId: '12345',
        message: { text: 'Hello' },
        extra: { disableNotification: true },
      });

      expect(result.status).toBe(NotificationStatus.Sent);
    });
  });

  describe('mapTelegramError', () => {
    it('should map forbidden bot blocked error', () => {
      const result = strategy['mapTelegramError']({
        response: { description: 'Forbidden: bot was blocked by the user' },
      });

      expect(result.status).toBe(NotificationStatus.Rejected);
      expect(result.errorReason).toBe(NotificationErrorReason.BlockedBot);
    });

    it('should map user deactivated error', () => {
      const result = strategy['mapTelegramError']({
        response: { description: 'Forbidden: user is deactivated' },
      });

      expect(result.status).toBe(NotificationStatus.Rejected);
      expect(result.errorReason).toBe(NotificationErrorReason.TelegramUserDeactivated);
    });

    it('should map bot cannot initiate conversation error', () => {
      const result = strategy['mapTelegramError']({
        response: { description: "Forbidden: bot can't initiate conversation with a user" },
      });

      expect(result.status).toBe(NotificationStatus.Rejected);
      expect(result.errorReason).toBe(NotificationErrorReason.BotCantInitiateConversation);
    });

    it('should map chat not found error', () => {
      const result = strategy['mapTelegramError']({
        response: { description: 'Bad Request: chat not found' },
      });

      expect(result.status).toBe(NotificationStatus.Rejected);
      expect(result.errorReason).toBe(NotificationErrorReason.ChatNotFound);
    });

    it('should map network error as pending', () => {
      const result = strategy['mapTelegramError']({
        response: { description: 'request to https://api.telegram.org failed' },
      });

      expect(result.status).toBe(NotificationStatus.Pending);
      expect(result.errorReason).toBe(NotificationErrorReason.NetworkError);
    });

    it('should map rate limit error as pending', () => {
      const result = strategy['mapTelegramError']({
        response: { description: 'Too Many Requests: retry after 5' },
      });

      expect(result.status).toBe(NotificationStatus.Pending);
      expect(result.errorReason).toBe(NotificationErrorReason.RateLimit);
    });

    it('should map unknown error', () => {
      const result = strategy['mapTelegramError'](new Error('Unknown failure'));

      expect(result.status).toBe(NotificationStatus.Error);
      expect(result.errorReason).toBe(NotificationErrorReason.UnknownError);
    });
  });
});
