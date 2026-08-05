// @requirements REQ-NOTIFY-PERSISTENCE-005
import 'reflect-metadata';
import { LockMode } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import { describe, expect, it, vi } from 'vitest';
import {
  NotificationAudienceSnapshotStatus,
  NotificationBroadcastStatus,
  NotificationChannel,
  NotificationDeliveryProvider,
  NotificationTargetType,
} from '@app/common-notifications';
import {
  NotificationAudienceSnapshotEntity,
  NotificationAudienceSnapshotMemberEntity,
  NotificationBroadcastEntity,
  NotificationDeliveryEntity,
  NotificationEntity,
  NotificationTemplateEntity,
  NotificationTemplateVersionEntity,
} from '../infrastructure/data-access/entities';
import { NotificationPayloadCryptoService } from '../notification-payload-crypto.service';
import { PostgresNotificationBroadcastPersistence } from './postgres-notification-broadcast.persistence';

describe(PostgresNotificationBroadcastPersistence.name, () => {
  it('claims and materializes a broadcast chunk inside one locked transaction', async () => {
    const template = new NotificationTemplateEntity({ code: 'broadcast' });
    const version = new NotificationTemplateVersionEntity({
      templateId: template.id,
      version: 1,
      publishedAt: new Date('2026-07-20T00:00:00.000Z'),
    });
    const broadcast = new NotificationBroadcastEntity({
      templateVersionId: version.id,
      status: NotificationBroadcastStatus.Sending,
      provider: NotificationDeliveryProvider.Resend,
      channel: NotificationChannel.Email,
      globalVariables: {},
    });
    const snapshot = new NotificationAudienceSnapshotEntity({
      broadcastId: broadcast.id,
      status: NotificationAudienceSnapshotStatus.Completed,
    });
    const member = new NotificationAudienceSnapshotMemberEntity({
      snapshotId: snapshot.id,
      targetType: NotificationTargetType.Email,
      targetId: 'recipient@example.test',
    });
    const transaction = transactionEntityManager();
    transaction.findOne.mockImplementation((entity: unknown) => {
      if (entity === NotificationBroadcastEntity) {
        return Promise.resolve(broadcast);
      }
      if (entity === NotificationAudienceSnapshotEntity) {
        return Promise.resolve(snapshot);
      }
      if (entity === NotificationTemplateVersionEntity) {
        return Promise.resolve(version);
      }
      if (entity === NotificationTemplateEntity) {
        return Promise.resolve(template);
      }
      return Promise.resolve(null);
    });
    transaction.find.mockImplementation((entity: unknown) => {
      if (entity === NotificationAudienceSnapshotMemberEntity) {
        return Promise.resolve(member.materializedAt ? [] : [member]);
      }
      if (entity === NotificationEntity) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const persistence = persistenceWith(transaction);
    await expect(persistence.materializeNextBroadcastChunk(25)).resolves.toBe(1);
    await expect(persistence.materializeNextBroadcastChunk(25)).resolves.toBe(0);

    expect(transaction.transactional).toHaveBeenCalledTimes(2);
    expect(transaction.findOne).toHaveBeenCalledWith(
      NotificationBroadcastEntity,
      { status: NotificationBroadcastStatus.Sending, materializedAt: null },
      expect.objectContaining({ lockMode: LockMode.PESSIMISTIC_PARTIAL_WRITE }),
    );
    expect(transaction.find).toHaveBeenCalledWith(
      NotificationAudienceSnapshotMemberEntity,
      { snapshotId: snapshot.id, materializedAt: null },
      expect.objectContaining({ limit: 25, lockMode: LockMode.PESSIMISTIC_PARTIAL_WRITE }),
    );
    expect(member.materializedAt).toBeInstanceOf(Date);
    expect(broadcast.queuedCount).toBe(1);
    expect(broadcast.pendingCount).toBe(1);
    expect(broadcast.materializedAt).toBeInstanceOf(Date);
    expect(transaction.persist).toHaveBeenCalledWith([
      expect.any(NotificationEntity),
      expect.any(NotificationDeliveryEntity),
    ]);
  });

  it('activates only due scheduled broadcasts in one idempotent update', async () => {
    const now = new Date('2026-07-20T12:00:00.000Z');
    const nativeUpdate = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const persistence = new PostgresNotificationBroadcastPersistence(
      {
        nativeUpdate,
        transactional: async (callback: (em: { nativeUpdate: typeof nativeUpdate }) => Promise<unknown>) =>
          callback({ nativeUpdate }),
      } as unknown as EntityManager,
      payloadCrypto(),
    );

    await expect(
      Promise.all([persistence.activateDueBroadcasts(now), persistence.activateDueBroadcasts(now)]),
    ).resolves.toEqual([1, 0]);
    expect(nativeUpdate).toHaveBeenCalledWith(
      NotificationBroadcastEntity,
      { status: NotificationBroadcastStatus.Scheduled, scheduledAt: { $lte: now } },
      { status: NotificationBroadcastStatus.Sending, updatedAt: now },
    );
  });
});

function persistenceWith(transaction: ReturnType<typeof transactionEntityManager>) {
  return new PostgresNotificationBroadcastPersistence(
    { transactional: transaction.transactional } as unknown as EntityManager,
    payloadCrypto(),
  );
}

function transactionEntityManager() {
  const transaction = {
    findOne: vi.fn(),
    find: vi.fn(),
    persist: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    transactional: vi.fn(),
  };
  transaction.transactional.mockImplementation(async (callback: (em: typeof transaction) => Promise<unknown>) =>
    callback(transaction),
  );
  return transaction;
}

function payloadCrypto(): NotificationPayloadCryptoService {
  return new NotificationPayloadCryptoService({
    NOTIFICATION_PAYLOAD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  });
}
