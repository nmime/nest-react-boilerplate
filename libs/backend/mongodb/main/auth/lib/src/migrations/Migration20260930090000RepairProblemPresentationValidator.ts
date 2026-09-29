import type { Db } from 'mongodb';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { assertCollectionDefinition, type MongoMigration } from '../../../../shared/lib/src/migrations/mongo-migration';
import { AuthMongoCollectionDefinitions, AuthMongoCollections } from '../auth-mongo.collections';

const definition = () => {
  const value = AuthMongoCollectionDefinitions.find((item) => item.name === AuthMongoCollections.presentations);
  if (!value) {
    throw new Error('Missing problem presentation collection definition.');
  }
  return value;
};

export const Migration20260930090000RepairProblemPresentationValidator: MongoMigration = {
  id: '20260930090000_repair_problem_presentation_validator',
  name: 'RepairProblemPresentationValidator',
  async up(database: Db): Promise<void> {
    await database.command({
      collMod: AuthMongoCollections.presentations,
      validator: definition().validator,
      validationAction: 'error',
      validationLevel: 'strict',
    });
  },
  async verify(database: Db): Promise<void> {
    await assertCollectionDefinition(database, definition());
  },
};
