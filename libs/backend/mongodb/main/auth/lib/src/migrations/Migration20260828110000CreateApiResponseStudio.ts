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
    await database.collection(AuthMongoCollections.presentations).updateMany({ textsEn: { $exists: false } }, [
      {
        $set: {
          messageZh: { $literal: '' },
          textsEn: { $cond: [{ $eq: ['$messageEn', ''] }, [], ['$messageEn']] },
          textsRu: { $cond: [{ $eq: ['$messageRu', ''] }, [], ['$messageRu']] },
          textsZh: { $literal: [] },
          support: { $literal: false },
          customDescription: { $literal: '' },
          figmaOnly: { $literal: false },
        },
      },
    ]);
  },
  async verify(database: Db): Promise<void> {
    await verifyMongoAuthPersistence(database);
  },
};
