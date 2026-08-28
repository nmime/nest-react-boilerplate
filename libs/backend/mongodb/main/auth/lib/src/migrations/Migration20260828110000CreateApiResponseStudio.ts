import type { Db } from 'mongodb';
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { MongoMigration } from '../../../../shared/lib/src/migrations/mongo-migration';
import {
  AuthMongoCollections,
  initializeMongoAuthPersistence,
  verifyMongoAuthPersistence,
} from '../auth-mongo.collections';

export const Migration20260828110000CreateApiResponseStudio: MongoMigration = {
  id: '20260828110000_create_api_response_studio',
  name: 'CreateApiResponseStudio',
  async up(database: Db): Promise<void> {
    await initializeMongoAuthPersistence(database);
    await database.collection(AuthMongoCollections.presentations).updateMany({}, [
      {
        $set: {
          messageZh: { $ifNull: ['$messageZh', ''] },
          textsEn: { $ifNull: ['$textsEn', { $cond: [{ $eq: ['$messageEn', ''] }, [], ['$messageEn']] }] },
          textsRu: { $ifNull: ['$textsRu', { $cond: [{ $eq: ['$messageRu', ''] }, [], ['$messageRu']] }] },
          textsZh: { $ifNull: ['$textsZh', []] },
          support: { $ifNull: ['$support', false] },
          customDescription: { $ifNull: ['$customDescription', ''] },
          figmaOnly: { $ifNull: ['$figmaOnly', false] },
        },
      },
    ]);
  },
  async verify(database: Db): Promise<void> {
    await verifyMongoAuthPersistence(database);
  },
};
