import type { MongoClient } from "mongodb";

export async function dropSelectedMongoDatabase(
  client: Pick<MongoClient, "db">,
  database: string,
): Promise<void> {
  await client.db(database).dropDatabase();
}
