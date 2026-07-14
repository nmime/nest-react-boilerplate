import { describe, it, expect, beforeEach } from 'vitest';
import { NotificationStrategyResolverService } from './notification-strategy-resolver.service';
import { NotificationTargetType } from '@app/backend-postgres-main-notification';

describe(NotificationStrategyResolverService.name, () => {
  let service: NotificationStrategyResolverService;
  const userStrategy = { handleNotification: async () => {} } as any;
  const telegramStrategy = { handleNotification: async () => {} } as any;

  beforeEach(() => {
    service = new NotificationStrategyResolverService();
    service.register(NotificationTargetType.User, userStrategy);
    service.register(NotificationTargetType.TelegramChat, telegramStrategy);
  });

  describe('resolve', () => {
    it('should resolve user strategy for User target type', () => {
      const result = service.resolve(NotificationTargetType.User);
      expect(result).toBe(userStrategy);
    });

    it('should resolve telegram-chat strategy for TelegramChat target type', () => {
      const result = service.resolve(NotificationTargetType.TelegramChat);
      expect(result).toBe(telegramStrategy);
    });

    it('should return undefined for unknown target type', () => {
      const result = service.resolve('unknown' as any);
      expect(result).toBeUndefined();
    });
  });
});
