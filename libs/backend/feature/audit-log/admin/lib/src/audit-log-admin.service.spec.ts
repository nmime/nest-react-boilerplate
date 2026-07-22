import type { EntityManager } from '@mikro-orm/core';
import { describe, expect, it, vi } from 'vitest';
import { okAsync } from 'neverthrow';
import {
  AdminAuditLogEntity,
  AdminAuditLogTransactionError,
  type AdminAuditLogRepository,
} from '@app/backend-postgres-main-auth';
import { AuditLogAdminPersistenceError, AuditLogAdminService } from './audit-log-admin.service';

describe('AuditLogAdminService', () => {
  const transactionalEntityManager = {} as EntityManager;

  it('keeps list and detail reads tenant scoped', async () => {
    const entry = new AdminAuditLogEntity({
      tenantId: '00000000-0000-4000-8000-000000000001',
      action: 'admin.user.status.update',
      resource: 'admin.users',
    });
    const repository = {
      list: vi.fn(() => okAsync([entry])),
      count: vi.fn(() => okAsync(1)),
      findById: vi.fn(() => okAsync(entry)),
    } as unknown as AdminAuditLogRepository;
    const service = new AuditLogAdminService(repository);

    await expect(service.list(entry.tenantId, { resource: 'admin.users' })).resolves.toMatchObject({
      total: 1,
      items: [{ id: entry.id, resource: 'admin.users' }],
    });
    await service.get(entry.id, entry.tenantId);

    expect(repository.list).toHaveBeenCalledWith(expect.objectContaining({ tenantId: entry.tenantId }));
    expect(repository.findById).toHaveBeenCalledWith(entry.id, entry.tenantId);
  });

  it('exposes the complete action and resource metadata catalog', () => {
    const service = new AuditLogAdminService({} as AdminAuditLogRepository);
    expect(service.metadata()).toMatchObject({
      actions: expect.arrayContaining(['admin.notification_broadcast.command']),
      resources: expect.arrayContaining(['admin.notification-broadcasts', 'admin.feature-flags']),
    });
  });

  it('runs a mutation and its audit record through one repository transaction', async () => {
    const recordTransactionally = vi.fn(
      async ({ operation, audit }: Parameters<AdminAuditLogRepository['recordTransactionally']>[0]) => {
        const result = await operation(transactionalEntityManager);
        audit(result);
        return result;
      },
    );
    const repository = { recordTransactionally } as unknown as AdminAuditLogRepository;
    const service = new AuditLogAdminService(repository);

    await expect(
      service.recordMutation(
        {
          tenantId: '00000000-0000-4000-8000-000000000001',
          actorUserId: '00000000-0000-4000-8000-000000000002',
          action: 'admin.notification_broadcast.create',
          resource: 'admin.notification-broadcasts',
          targetId: (result: { id: string }) => result.id,
          after: (result) => ({ status: result.status }),
        },
        async () => ({ id: 'broadcast-1', status: 'draft' }),
      ),
    ).resolves.toEqual({ id: 'broadcast-1', status: 'draft' });

    expect(recordTransactionally).toHaveBeenCalledTimes(1);
  });

  it('distinguishes an audit transaction failure from a domain-operation failure', async () => {
    const repository = {
      recordTransactionally: vi.fn(
        async ({ operation, audit }: Parameters<AdminAuditLogRepository['recordTransactionally']>[0]) => {
          const result = await operation(transactionalEntityManager);
          audit(result);
          throw new AdminAuditLogTransactionError(new Error('commit failed'));
        },
      ),
    } as unknown as AdminAuditLogRepository;
    const service = new AuditLogAdminService(repository);

    await expect(
      service.recordMutation(
        {
          tenantId: '00000000-0000-4000-8000-000000000001',
          action: 'admin.notification_broadcast.create',
          resource: 'admin.notification-broadcasts',
          after: () => ({}),
        },
        async () => ({ id: 'broadcast-1' }),
      ),
    ).rejects.toBeInstanceOf(AuditLogAdminPersistenceError);

    const operationFailure = new Error('domain rejected');
    repository.recordTransactionally = vi.fn(
      async ({ operation }: Parameters<AdminAuditLogRepository['recordTransactionally']>[0]) =>
        operation(transactionalEntityManager),
    ) as AdminAuditLogRepository['recordTransactionally'];
    await expect(
      service.recordMutation(
        {
          tenantId: '00000000-0000-4000-8000-000000000001',
          action: 'admin.notification_broadcast.create',
          resource: 'admin.notification-broadcasts',
          after: () => ({}),
        },
        async () => Promise.reject(operationFailure),
      ),
    ).rejects.toBe(operationFailure);
  });
});
