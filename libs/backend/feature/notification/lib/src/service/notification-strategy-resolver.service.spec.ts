import { describe, it, expect, beforeEach } from 'vitest';
import { NotificationStrategyResolverService } from './notification-strategy-resolver.service';
import { NotificationTargetType } from '@app/backend-postgres-main-notification';

describe(NotificationStrategyResolverService.name, () => {
  let service: NotificationStrategyResolverService;

  beforeEach(() => {
    service = new NotificationStrategyResolverService(
      { handleNotification: async () => {} } as any,
      { handleNotification: async () => {} } as any,
    );
  });

  describe('resolve', () => {
    it('should resolve user strategy for User target type', () => {
      const result = service.resolve(NotificationTargetType.User);
      expect(result).toBeDefined();
    });

    it('should resolve telegram-chat strategy for TelegramChat target type', () => {
      const result = service.resolve(NotificationTargetType.TelegramChat);
      expect(result).toBeDefined();
    });

    it('should return undefined for unknown target type', () => {
      const result = service.resolve('unknown' as any);
      expect(result).toBeUndefined();
    });
  });
});
