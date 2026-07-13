import { describe, it, expect } from 'vitest';
import { NotificationChannel } from './notification-channel.enum';
import { NotificationStatus } from './notification-status.enum';
import { NotificationTargetType } from './notification-target-type.enum';
import { NotificationPriority } from './notification-priority.enum';
import { NotificationErrorReason } from './notification-error-reason.enum';
import { NotificationTemplateEngine } from './notification-template-engine.enum';

describe('Notification Enums', () => {
  describe(NotificationChannel.name, () => {
    it('should have expected channel values', () => {
      expect(NotificationChannel.Bot).toBe('bot');
      expect(NotificationChannel.Email).toBe('email');
      expect(NotificationChannel.Push).toBe('push');
      expect(NotificationChannel.InApp).toBe('in_app');
    });
  });

  describe(NotificationStatus.name, () => {
    it('should have expected status values', () => {
      expect(NotificationStatus.Pending).toBe('pending');
      expect(NotificationStatus.Sent).toBe('sent');
      expect(NotificationStatus.Error).toBe('error');
      expect(NotificationStatus.Rejected).toBe('rejected');
    });
  });

  describe(NotificationTargetType.name, () => {
    it('should have expected target type values', () => {
      expect(NotificationTargetType.User).toBe('user');
      expect(NotificationTargetType.TelegramChat).toBe('telegram_chat');
    });
  });

  describe(NotificationPriority.name, () => {
    it('should have expected priority values', () => {
      expect(NotificationPriority.High).toBe(200);
      expect(NotificationPriority.Default).toBe(100);
      expect(NotificationPriority.Promo).toBe(50);
      expect(NotificationPriority.MassPromo).toBe(0);
    });
  });

  describe(NotificationErrorReason.name, () => {
    it('should have expected error reason values', () => {
      expect(NotificationErrorReason.UserBlocked).toBe('user_blocked');
      expect(NotificationErrorReason.ChatNotFound).toBe('chat_not_found');
      expect(NotificationErrorReason.ChatRestricted).toBe('chat_restricted');
      expect(NotificationErrorReason.BlockedBot).toBe('blocked_bot');
      expect(NotificationErrorReason.BotCantInitiateConversation).toBe('bot_cant_initiate_converation');
      expect(NotificationErrorReason.MarkedAsBlockedBot).toBe('marked_as_blocked_bot');
      expect(NotificationErrorReason.TelegramUserDeactivated).toBe('telegram_user_deactivated');
      expect(NotificationErrorReason.MarkedAsTelegramUserDeactivated).toBe('marked_as_telegram_user_deactivated');
      expect(NotificationErrorReason.UnknownError).toBe('unknown_error');
      expect(NotificationErrorReason.NetworkError).toBe('network_error');
      expect(NotificationErrorReason.RateLimit).toBe('rate_limit');
      expect(NotificationErrorReason.IncorrectTarget).toBe('incorrect_target');
      expect(NotificationErrorReason.NotFoundMessage).toBe('not_found_message');
      expect(NotificationErrorReason.NotFoundMessageStrategy).toBe('not_found_message_strategy');
    });
  });

  describe(NotificationTemplateEngine.name, () => {
    it('should have expected engine values', () => {
      expect(NotificationTemplateEngine.StringFormat).toBe('string-format');
      expect(NotificationTemplateEngine.Eta).toBe('eta');
    });
  });
});
