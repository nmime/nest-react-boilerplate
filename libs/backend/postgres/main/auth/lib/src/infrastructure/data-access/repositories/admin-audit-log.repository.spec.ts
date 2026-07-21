import type { EntityManager } from '@mikro-orm/postgresql';
import { describe, expect, it, vi } from 'vitest';
import { AdminAuditLogEntity, DefaultAuthTenantId, TransactionalOutboxEventEntity } from '../entities';
import { AdminAuditLogRepository, AdminAuditLogTransactionError } from './admin-audit-log.repository';

function createEntityManagerMock() {
  const persist = vi.fn(() => undefined);
  const flush = vi.fn(() => Promise.resolve());
  const find = vi.fn(() => Promise.resolve<AdminAuditLogEntity[]>([]));
  const findOne = vi.fn(() => Promise.resolve<AdminAuditLogEntity | null>(null));
  const count = vi.fn(() => Promise.resolve(0));
  const entityManager = {
    persist,
    flush,
    find,
    findOne,
    count,
  } as unknown as EntityManager;
  const transactional = vi.fn(async (handler: (manager: EntityManager) => Promise<unknown>) => handler(entityManager));
  Object.assign(entityManager, { transactional });

  return { persist, flush, find, findOne, count, transactional, entityManager };
}

describe('AdminAuditLogRepository', () => {
  it('records audit logs through MikroORM', async () => {
    const { persist, flush, entityManager } = createEntityManagerMock();
    const auditLogs = new AdminAuditLogRepository(entityManager);

    const result = await auditLogs.record({
      tenantId: '00000000-0000-4000-8000-000000000001',
      actorUserId: '00000000-0000-4000-8000-000000000002',
      action: 'admin.user.status.update',
      resource: 'admin.users',
      targetUserId: '00000000-0000-4000-8000-000000000003',
      before: { status: 'active' },
      after: { status: 'disabled' },
      metadata: { requestId: 'req-1' },
    });

    const entity = result._unsafeUnwrap();
    expect(entity).toMatchObject({
      tenantId: '00000000-0000-4000-8000-000000000001',
      actorUserId: '00000000-0000-4000-8000-000000000002',
      action: 'admin.user.status.update',
      resource: 'admin.users',
      targetUserId: '00000000-0000-4000-8000-000000000003',
      before: { status: 'active' },
      after: { status: 'disabled' },
      metadata: { requestId: 'req-1' },
    });
    expect(persist).toHaveBeenCalledWith([entity, expect.any(TransactionalOutboxEventEntity)]);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('records an audit entry in the same transaction as its mutation', async () => {
    const { persist, flush, transactional, entityManager } = createEntityManagerMock();
    const auditLogs = new AdminAuditLogRepository(entityManager);
    const operation = vi.fn(async () => ({ id: 'broadcast-1', status: 'ready' }));

    await expect(
      auditLogs.recordTransactionally({
        operation,
        audit: (result) => ({
          tenantId: '00000000-0000-4000-8000-000000000001',
          action: 'admin.notification_broadcast.create',
          resource: 'admin.notification-broadcasts',
          targetUserId: result.id,
          after: { status: result.status },
        }),
      }),
    ).resolves.toEqual({ id: 'broadcast-1', status: 'ready' });

    expect(transactional).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith([
      expect.objectContaining({
        resource: 'admin.notification-broadcasts',
        targetUserId: 'broadcast-1',
        after: { status: 'ready' },
      }),
      expect.any(TransactionalOutboxEventEntity),
    ]);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('preserves domain failures and identifies audit transaction failures', async () => {
    const { persist, flush, entityManager } = createEntityManagerMock();
    const auditLogs = new AdminAuditLogRepository(entityManager);
    const domainFailure = new Error('domain rejected');

    await expect(
      auditLogs.recordTransactionally({
        operation: async () => Promise.reject(domainFailure),
        audit: () => ({ action: 'admin.notification_broadcast.create', resource: 'admin.notification-broadcasts' }),
      }),
    ).rejects.toBe(domainFailure);
    expect(persist).not.toHaveBeenCalled();

    flush.mockRejectedValueOnce(new Error('audit insert failed'));
    await expect(
      auditLogs.recordTransactionally({
        operation: async () => ({ id: 'broadcast-1' }),
        audit: () => ({ action: 'admin.notification_broadcast.create', resource: 'admin.notification-broadcasts' }),
      }),
    ).rejects.toBeInstanceOf(AdminAuditLogTransactionError);
  });

  it('lists and counts with tenant-scoped filters, capped pagination, and deterministic ordering', async () => {
    const entity = new AdminAuditLogEntity({
      action: 'admin.user.status.update',
      resource: 'admin.users',
    });
    const { find, count, entityManager } = createEntityManagerMock();
    find.mockResolvedValue([entity]);
    count.mockResolvedValue(1);
    const auditLogs = new AdminAuditLogRepository(entityManager);

    await expect(
      auditLogs
        .list({
          tenantId: '00000000-0000-4000-8000-000000000001',
          action: 'admin.user.status.update',
          resource: 'admin.users',
          actorUserId: '00000000-0000-4000-8000-000000000002',
          targetUserId: '00000000-0000-4000-8000-000000000003',
          createdFrom: new Date('2026-07-01T00:00:00.000Z'),
          createdTo: new Date('2026-07-21T00:00:00.000Z'),
          limit: 1_000,
          offset: -10,
        })
        .then((result) => result._unsafeUnwrap()),
    ).resolves.toEqual([entity]);
    await expect(
      auditLogs
        .count({
          tenantId: '00000000-0000-4000-8000-000000000001',
          action: 'admin.user.status.update',
        })
        .then((result) => result._unsafeUnwrap()),
    ).resolves.toBe(1);

    expect(find).toHaveBeenCalledWith(
      AdminAuditLogEntity,
      {
        tenantId: '00000000-0000-4000-8000-000000000001',
        action: 'admin.user.status.update',
        resource: 'admin.users',
        actorUserId: '00000000-0000-4000-8000-000000000002',
        targetUserId: '00000000-0000-4000-8000-000000000003',
        createdAt: {
          $gte: new Date('2026-07-01T00:00:00.000Z'),
          $lte: new Date('2026-07-21T00:00:00.000Z'),
        },
      },
      { limit: 100, offset: 0, orderBy: { createdAt: 'DESC', id: 'DESC' } },
    );
    expect(count).toHaveBeenCalledWith(AdminAuditLogEntity, {
      tenantId: '00000000-0000-4000-8000-000000000001',
      action: 'admin.user.status.update',
    });
  });

  it('defaults tenant and clamps invalid pagination at repository level', async () => {
    const { find, entityManager } = createEntityManagerMock();
    const auditLogs = new AdminAuditLogRepository(entityManager);

    await auditLogs.list({ limit: 0, offset: Number.NaN });

    expect(find).toHaveBeenCalledWith(
      AdminAuditLogEntity,
      { tenantId: DefaultAuthTenantId },
      { limit: 1, offset: 0, orderBy: { createdAt: 'DESC', id: 'DESC' } },
    );
  });

  it('gets a single audit entry by id and tenant together', async () => {
    const entry = new AdminAuditLogEntity({
      tenantId: '00000000-0000-4000-8000-000000000001',
      action: 'admin.user.status.update',
      resource: 'admin.users',
    });
    const { findOne, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entry);
    const auditLogs = new AdminAuditLogRepository(entityManager);

    await expect(auditLogs.findById(entry.id, entry.tenantId).then((result) => result._unsafeUnwrap())).resolves.toBe(
      entry,
    );
    expect(findOne).toHaveBeenCalledWith(AdminAuditLogEntity, { id: entry.id, tenantId: entry.tenantId });
  });

  it('maps repository failures', async () => {
    const { flush, entityManager } = createEntityManagerMock();
    flush.mockRejectedValue(new Error('audit insert failed'));
    const auditLogs = new AdminAuditLogRepository(entityManager);

    const result = await auditLogs.record({
      action: 'admin.user.status.update',
      resource: 'admin.users',
    });

    expect(result._unsafeUnwrapErr()).toEqual({
      code: 'repository_error',
      message: 'audit insert failed',
    });
  });

  it('falls back to a stable message for non-error failures', async () => {
    const { flush, entityManager } = createEntityManagerMock();
    flush.mockRejectedValue('connection reset');
    const auditLogs = new AdminAuditLogRepository(entityManager);

    const result = await auditLogs.record({
      action: 'admin.user.status.update',
      resource: 'admin.users',
    });

    expect(result._unsafeUnwrapErr()).toEqual({
      code: 'repository_error',
      message: 'Admin audit repository failed.',
    });
  });

  it('defaults to the default tenant when listing and counting without input', async () => {
    const { find, count, entityManager } = createEntityManagerMock();
    const auditLogs = new AdminAuditLogRepository(entityManager);

    await auditLogs.list();
    await auditLogs.count();

    expect(find).toHaveBeenCalledWith(
      AdminAuditLogEntity,
      { tenantId: DefaultAuthTenantId },
      { limit: 50, offset: 0, orderBy: { createdAt: 'DESC', id: 'DESC' } },
    );
    expect(count).toHaveBeenCalledWith(AdminAuditLogEntity, {
      tenantId: DefaultAuthTenantId,
    });
  });
});
