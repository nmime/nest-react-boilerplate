// @requirements REQ-NOTIFY-LIFECYCLE-002
import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { NotificationBroadcastSchedulerService } from './notification-broadcast-scheduler.service';

describe(NotificationBroadcastSchedulerService.name, () => {
  it('delegates due activation before refreshing broadcast statistics', async () => {
    const calls: string[] = [];
    const persistence = {
      activateDueBroadcasts: vi.fn(async (now: Date) => {
        expect(now).toBeInstanceOf(Date);
        calls.push('activate');
        return 2;
      }),
      refreshBroadcastStatistics: vi.fn(async () => {
        calls.push('refresh');
        return 3;
      }),
    };
    const debug = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    const service = new NotificationBroadcastSchedulerService(persistence as never);

    await service.run();

    expect(calls).toEqual(['activate', 'refresh']);
    expect(debug).toHaveBeenCalledWith('Activated 2 and refreshed 3 notification broadcasts');
    debug.mockRestore();
  });

  it('logs and contains an iteration failure without refreshing or rejecting the cron wrapper', async () => {
    const failure = new Error('database unavailable');
    const persistence = {
      activateDueBroadcasts: vi.fn().mockRejectedValue(failure),
      refreshBroadcastStatistics: vi.fn(),
    };
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new NotificationBroadcastSchedulerService(persistence as never);

    await expect(service.run()).resolves.toBeUndefined();

    expect(persistence.refreshBroadcastStatistics).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('Notification broadcast scheduler iteration failed', failure.stack);
    error.mockRestore();
  });
});
