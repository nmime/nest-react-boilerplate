import { describe, it, expect, vi } from 'vitest';
import { UserNotificationSchedulerService } from './user-notification-scheduler.service';

describe(UserNotificationSchedulerService.name, () => {
  describe('chunk', () => {
    let service: UserNotificationSchedulerService;

    beforeEach(() => {
      service = new UserNotificationSchedulerService(
        { send: { userPerIteration: 100, requestsPerSecond: 10 } } as any,
        { findPending: async () => [] } as any,
        { resolve: () => undefined } as any,
        { applyStatusFromNotifications: async () => {} } as any,
        { resolve: () => undefined } as any,
        { resolve: () => undefined } as any,
        { transactional: async (fn: any) => fn({ persist: () => {}, flush: async () => {} }) } as any,
      );
    });

    it('should split array into chunks of given size', () => {
      const arr = [1, 2, 3, 4, 5];
      const result = service['chunk'](arr, 2);
      expect(result).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('should return single chunk when size >= array length', () => {
      const arr = [1, 2];
      const result = service['chunk'](arr, 10);
      expect(result).toEqual([[1, 2]]);
    });

    it('should return empty array for empty input', () => {
      const result = service['chunk']([], 5);
      expect(result).toEqual([]);
    });
  });

  describe('sleep', () => {
    it('should resolve after specified time', async () => {
      const service = new UserNotificationSchedulerService(
        { send: { userPerIteration: 100, requestsPerSecond: 10 } } as any,
        { findPending: async () => [] } as any,
        { resolve: () => undefined } as any,
        { applyStatusFromNotifications: async () => {} } as any,
        { resolve: () => undefined } as any,
        { resolve: () => undefined } as any,
        {} as any,
      );
      const start = Date.now();
      await service['sleep'](50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(45);
    });
  });
});
