import { MongoClient } from 'mongodb';

import { assertLocalMongoDatabase, createMongoOperationEnvironment } from './mongo-client.ts';
import { migrateMongoDatabase } from './mongo-migrate.ts';
import { dropSelectedMongoDatabase } from './mongo-reset.ts';

export async function resetMongoDatabase(): Promise<void> {
  const config = createMongoOperationEnvironment();
  assertLocalMongoDatabase(config.uri);
  const client = new MongoClient(config.uri, {
    appName: 'nrb-db-reset',
    replicaSet: config.replicaSet,
    retryWrites: true,
    writeConcern: { w: 'majority' },
  });
  try {
    await client.connect();
    await dropSelectedMongoDatabase(client, config.database);
  } finally {
    await client.close();
  }

  const migration = await migrateMongoDatabase();
  console.log(
    JSON.stringify({
      status: 'reset',
      provider: 'mongodb',
      database: config.database,
      droppedDatabase: true,
      executed: migration.applied,
      executedCount: migration.applied.length,
    }),
  );
}
