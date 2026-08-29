// @requirements REQ-NOTIFY-AUDIENCE-004 REQ-NOTIFY-PERSISTENCE-005
import type { Db } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { NotificationMongoCollections } from './notification-mongo.documents';
import { Migration20260826190100NotificationTenantOwnership } from './migrations';

describe('Mongo notification tenant ownership migration', () => {
  it('backfills broadcast tenant ownership', async () => {
    const first = {
      _id: 'broadcast-notification',
      broadcastId: 'broadcast-1',
    };
    const notifications = {
      find: vi.fn(() => ({
        async *[Symbol.asyncIterator]() {
          yield first;
        },
      })),
      updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
      createIndexes: vi.fn().mockResolvedValue([]),
    };
    const broadcasts = {
      findOne: vi.fn().mockResolvedValue({ tenantId: '11111111-1111-4111-8111-111111111111' }),
      createIndexes: vi.fn().mockResolvedValue([]),
    };
    const genericCollection = {
      createIndexes: vi.fn().mockResolvedValue([]),
      indexExists: vi.fn().mockResolvedValue(false),
      dropIndex: vi.fn().mockResolvedValue(undefined),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const database = {
      collection: vi.fn((name: string) => {
        if (name === NotificationMongoCollections.notifications) {
          return notifications;
        }
        if (name === NotificationMongoCollections.broadcasts) {
          return broadcasts;
        }
        return genericCollection;
      }),
      createCollection: vi.fn().mockRejectedValue({ code: 48 }),
      command: vi.fn().mockResolvedValue({ ok: 1 }),
    } as unknown as Db;

    await Migration20260826190100NotificationTenantOwnership.up(database);

    expect(notifications.find).toHaveBeenCalledWith(
      { tenantId: { $exists: false } },
      { projection: { _id: 1, broadcastId: 1 } },
    );
    expect(notifications.updateOne).toHaveBeenNthCalledWith(
      1,
      { _id: first._id },
      { $set: { tenantId: '11111111-1111-4111-8111-111111111111' } },
    );
    expect(notifications.updateOne).toHaveBeenCalledTimes(1);
    expect(genericCollection.updateMany).toHaveBeenCalledWith(
      { tenantId: { $exists: false } },
      { $set: { tenantId: null } },
    );
    expect(database.command).toHaveBeenCalledWith(
      expect.objectContaining({ collMod: NotificationMongoCollections.notifications }),
    );
  });

  it('preflights every legacy owner and refuses ambiguity before mutating any notification', async () => {
    const notifications = {
      find: vi.fn(() => ({
        async *[Symbol.asyncIterator]() {
          yield { _id: 'resolvable-notification', broadcastId: 'broadcast-1' };
          yield { _id: 'legacy-notification', broadcastId: null };
        },
      })),
      updateOne: vi.fn(),
    };
    const broadcasts = {
      findOne: vi.fn().mockResolvedValue({ tenantId: '11111111-1111-4111-8111-111111111111' }),
    };
    const database = {
      collection: vi.fn((name: string) => {
        if (name === NotificationMongoCollections.notifications) {
          return notifications;
        }
        if (name === NotificationMongoCollections.broadcasts) {
          return broadcasts;
        }
        return { findOne: vi.fn() };
      }),
      createCollection: vi.fn(),
      command: vi.fn(),
    } as unknown as Db;

    await expect(Migration20260826190100NotificationTenantOwnership.up(database)).rejects.toThrow(
      'cannot infer tenant ownership for legacy ordinary notification',
    );
    expect(broadcasts.findOne).toHaveBeenCalledWith({ _id: 'broadcast-1' }, { projection: { tenantId: 1 } });
    expect(notifications.updateOne).not.toHaveBeenCalled();
    expect(database.createCollection).not.toHaveBeenCalled();
    expect(database.command).not.toHaveBeenCalled();
  });

  it('refuses an incompatible rollback before changing indexes or tenant data', async () => {
    const templates = {
      findOne: vi.fn().mockResolvedValue({ _id: 'tenant-template' }),
      aggregate: vi.fn(),
      indexExists: vi.fn(),
      dropIndex: vi.fn(),
      updateMany: vi.fn(),
    };
    const notifications = {
      indexExists: vi.fn(),
      dropIndex: vi.fn(),
      updateMany: vi.fn(),
    };
    const database = {
      collection: vi.fn((name: string) =>
        name === NotificationMongoCollections.templates ? templates : notifications,
      ),
    } as unknown as Db;

    await expect(Migration20260826190100NotificationTenantOwnership.down?.(database)).rejects.toThrow(
      'cannot roll back notification tenant ownership',
    );
    expect(templates.indexExists).not.toHaveBeenCalled();
    expect(templates.dropIndex).not.toHaveBeenCalled();
    expect(templates.updateMany).not.toHaveBeenCalled();
    expect(notifications.indexExists).not.toHaveBeenCalled();
    expect(notifications.updateMany).not.toHaveBeenCalled();
  });
});
