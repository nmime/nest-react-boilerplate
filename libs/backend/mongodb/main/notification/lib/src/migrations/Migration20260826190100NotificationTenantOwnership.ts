import type { Db } from 'mongodb';
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { MongoMigration } from '../../../../shared/lib/src/migrations/mongo-migration';
import { initializeMongoNotificationPersistence } from '../notification-mongo.collections';
import {
  initializeTenantOwnedMongoNotificationPersistence,
  verifyTenantOwnedMongoNotificationPersistence,
} from '../notification-mongo.tenant-collections';
import { NotificationMongoCollections, type NotificationBroadcastDocument } from '../notification-mongo.documents';

interface LegacyNotificationDocument {
  _id: string;
  broadcastId?: string | null;
  tenantId?: string;
}

/** Backfills and requires tenant ownership on ordinary notification documents. */
export const Migration20260826190100NotificationTenantOwnership: MongoMigration = {
  id: '20260826190100_notification_tenant_ownership',
  name: 'NotificationTenantOwnership',

  async up(database: Db): Promise<void> {
    const notifications = database.collection<LegacyNotificationDocument>(NotificationMongoCollections.notifications);
    const broadcasts = database.collection<NotificationBroadcastDocument>(NotificationMongoCollections.broadcasts);
    const cursor = notifications.find({ tenantId: { $exists: false } }, { projection: { _id: 1, broadcastId: 1 } });
    const ownershipBackfills: Array<{ notificationId: string; tenantId: string }> = [];

    // Collection and validator DDL is not transactional. Resolve every legacy owner before the first
    // mutation so one ambiguous row cannot leave the documents before it partially backfilled.
    for await (const notification of cursor) {
      const broadcastId = typeof notification['broadcastId'] === 'string' ? notification['broadcastId'] : null;
      if (!broadcastId) {
        throw new Error(
          `cannot infer tenant ownership for legacy ordinary notification ${String(notification['_id'])}; set tenantId before re-running`,
        );
      }
      const broadcast = await broadcasts.findOne({ _id: broadcastId }, { projection: { tenantId: 1 } });
      if (!broadcast?.tenantId) {
        throw new Error(
          `cannot infer tenant ownership for notification ${String(notification['_id'])}; broadcast ${broadcastId} is missing`,
        );
      }
      ownershipBackfills.push({ notificationId: notification._id, tenantId: broadcast.tenantId });
    }

    for (const backfill of ownershipBackfills) {
      // eslint-disable-next-line no-await-in-loop -- replay-safe migration mutations are intentionally ordered.
      await notifications.updateOne({ _id: backfill.notificationId }, { $set: { tenantId: backfill.tenantId } });
    }

    const templates = database.collection(NotificationMongoCollections.templates);
    if ((await templates.indexExists('uq__notification_templates__code')) === true) {
      await templates.dropIndex('uq__notification_templates__code');
    }
    await templates.updateMany({ tenantId: { $exists: false } }, { $set: { tenantId: null } });
    await initializeTenantOwnedMongoNotificationPersistence(database);
  },

  async verify(database: Db): Promise<void> {
    await verifyTenantOwnedMongoNotificationPersistence(database);
    const missingNotifications = await database
      .collection(NotificationMongoCollections.notifications)
      .countDocuments({ tenantId: { $exists: false } }, { limit: 1 });
    if (missingNotifications > 0) {
      throw new Error('notification tenant backfill is incomplete');
    }
    const missingTemplates = await database
      .collection(NotificationMongoCollections.templates)
      .countDocuments({ tenantId: { $exists: false } }, { limit: 1 });
    if (missingTemplates > 0) {
      throw new Error('notification template tenant normalization is incomplete');
    }
  },

  async down(database: Db): Promise<void> {
    const templates = database.collection(NotificationMongoCollections.templates);
    const incompatibleTemplate = await templates.findOne({
      $or: [{ source: 'code', tenantId: { $ne: null } }, { source: 'admin' }],
    });
    if (incompatibleTemplate !== null) {
      throw new Error(
        'cannot roll back notification tenant ownership while tenant-owned code templates or admin templates exist',
      );
    }
    const duplicateCode = await templates
      .aggregate([{ $group: { _id: '$code', count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }, { $limit: 1 }])
      .next();
    if (duplicateCode !== null) {
      throw new Error('cannot roll back notification tenant ownership while duplicate-code templates exist');
    }

    if ((await templates.indexExists('uq__notification_templates__tenant_code')) === true) {
      await templates.dropIndex('uq__notification_templates__tenant_code');
    }
    const notifications = database.collection(NotificationMongoCollections.notifications);
    if ((await notifications.indexExists('ix__notifications__tenant_created')) === true) {
      await notifications.dropIndex('ix__notifications__tenant_created');
    }
    await notifications.updateMany({}, { $unset: { tenantId: '' } });
    await templates.updateMany({}, { $unset: { tenantId: '' } });
    await initializeMongoNotificationPersistence(database);
  },
};
