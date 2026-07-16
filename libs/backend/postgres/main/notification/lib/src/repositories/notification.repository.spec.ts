import type { EntityManager } from '@mikro-orm/postgresql';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationChannel, NotificationStatus, NotificationTargetType } from '../domain';
import { NotificationRepository } from './notification.repository';

describe('NotificationRepository', () => {
  const execute = vi.fn();
  const find = vi.fn();
  const entityManager = {
    find,
    getConnection: () => ({ execute }),
  } as unknown as EntityManager;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries pending notifications with MikroORM placeholders and preserves priority order', async () => {
    execute.mockResolvedValue([{ id: 'notification-2' }, { id: 'notification-1' }]);
    const template = { id: 'template-1', botChannel: null };
    const notification1 = { id: 'notification-1', template: null };
    const notification2 = { id: 'notification-2', template };
    const botChannel = { templateId: 'template-1', channel: NotificationChannel.Bot };
    find.mockResolvedValueOnce([notification1, notification2]).mockResolvedValueOnce([botChannel]);

    const repository = new NotificationRepository(entityManager);
    const result = await repository.findPending({
      targetType: NotificationTargetType.User,
      targetId: 'user-1',
      count: 10,
    });

    const [query, values] = execute.mock.calls[0] as [string, unknown[]];
    expect(query).not.toContain('$1');
    expect(query).toContain('notification.target_id = ?');
    expect(query).toContain('limit ?');
    expect(values).toEqual([
      NotificationTargetType.User,
      NotificationStatus.Pending,
      expect.stringMatching(/^\d{2}:\d{2}:\d{2}$/u),
      expect.stringMatching(/^\d{2}:\d{2}:\d{2}$/u),
      'user-1',
      10,
    ]);
    expect(template.botChannel).toBe(botChannel);
    expect(result).toEqual([notification2, notification1]);
    expect(repository.manager).toBe(entityManager);
  });

  it('returns early when there are no pending notifications', async () => {
    execute.mockResolvedValue([]);

    const result = await new NotificationRepository(entityManager).findPending({
      targetType: NotificationTargetType.TelegramChat,
      count: 5,
    });

    expect(result).toEqual([]);
    expect(find).not.toHaveBeenCalled();
    const [query, values] = execute.mock.calls[0] as [string, unknown[]];
    expect(query).not.toContain('notification.target_id = ?');
    expect(values).toHaveLength(5);
    expect(values[2]).toBe(values[3]);
  });

  it('returns distinct pending targets through a parameterized query', async () => {
    execute.mockResolvedValue([{ target_id: 'user-1' }, { target_id: 'user-2' }]);

    const result = await new NotificationRepository(entityManager).findPendingTargets(NotificationTargetType.User);

    expect(result).toEqual(['user-1', 'user-2']);
    const [query, values] = execute.mock.calls[0] as [string, unknown[]];
    expect(query).not.toContain('$1');
    expect(query).toContain('notification.target_type = ?');
    expect(values).toEqual([
      NotificationTargetType.User,
      NotificationStatus.Pending,
      expect.stringMatching(/^\d{2}:\d{2}:\d{2}$/u),
      expect.stringMatching(/^\d{2}:\d{2}:\d{2}$/u),
    ]);
    expect(values[2]).toBe(values[3]);
  });
});
