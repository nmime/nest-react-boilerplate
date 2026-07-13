import { describe, it, expect, vi } from 'vitest';
import { UserNotificationStrategy } from './user-notification.strategy';
import { NotificationChannel, NotificationErrorReason, NotificationStatus } from '@app/backend-postgres-main-notification';

describe(UserNotificationStrategy.name, () => {
  let strategy: UserNotificationStrategy;

  beforeEach(() => {
    strategy = new UserNotificationStrategy();
  });

  describe('handleNotification', () => {
    it('should set error status when message strategy is not found', async () => {
      const mockResolver = { resolve: vi.fn(() => undefined) };
      const mockChannelResolver = { resolve: vi.fn() };
      const mockMessageResolver = { resolve: vi.fn(() => undefined) };
      const mockNotification = { id: 'test-1', extra: {} };

      await strategy.handleNotification({
        notification: mockNotification as any,
        channelStrategyResolver: mockChannelResolver as any,
        messageStrategyResolver: mockMessageResolver as any,
      });

      expect(mockNotification.status).toBe(NotificationStatus.Error);
      expect(mockNotification.error.reason).toBe(NotificationErrorReason.NotFoundMessageStrategy);
    });

    it('should set error status when message is not found', async () => {
      const mockMessageStrategy = { getMessage: vi.fn(() => undefined) };
      const mockChannelResolver = { resolve: vi.fn() };
      const mockMessageResolver = { resolve: vi.fn(() => mockMessageStrategy) };
      const mockNotification = { id: 'test-1', extra: {} };

      await strategy.handleNotification({
        notification: mockNotification as any,
        channelStrategyResolver: mockChannelResolver as any,
        messageStrategyResolver: mockMessageResolver as any,
      });

      expect(mockNotification.status).toBe(NotificationStatus.Error);
      expect(mockNotification.error.reason).toBe(NotificationErrorReason.NotFoundMessage);
    });

    it('should set error status when channel strategy is not found', async () => {
      const mockMessageStrategy = { getMessage: vi.fn(() => ({ text: 'Hello' })) };
      const mockChannelResolver = { resolve: vi.fn(() => undefined) };
      const mockMessageResolver = { resolve: vi.fn(() => mockMessageStrategy) };
      const mockNotification = { id: 'test-1', extra: {}, targetId: '12345' };

      await strategy.handleNotification({
        notification: mockNotification as any,
        channelStrategyResolver: mockChannelResolver as any,
        messageStrategyResolver: mockMessageResolver as any,
      });

      expect(mockNotification.status).toBe(NotificationStatus.Error);
    });

    it('should send notification successfully', async () => {
      const mockSend = vi.fn().mockResolvedValue({ status: NotificationStatus.Sent });
      const mockMessageStrategy = { getMessage: vi.fn(() => ({ text: 'Hello' })) };
      const mockChannelStrategy = { send: mockSend };
      const mockChannelResolver = { resolve: vi.fn(() => mockChannelStrategy) };
      const mockMessageResolver = { resolve: vi.fn(() => mockMessageStrategy) };
      const mockNotification = { id: 'test-1', extra: {}, targetId: '12345' };

      await strategy.handleNotification({
        notification: mockNotification as any,
        channelStrategyResolver: mockChannelResolver as any,
        messageStrategyResolver: mockMessageResolver as any,
      });

      expect(mockSend).toHaveBeenCalledWith({
        telegramId: '12345',
        message: { text: 'Hello' },
        extra: {},
      });
      expect(mockNotification.status).toBe(NotificationStatus.Sent);
    });
  });
});
