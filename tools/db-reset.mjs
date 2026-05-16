#!/usr/bin/env node
import pg from "pg";
import {
  assertLocalDevelopmentDatabase,
  loadDotEnv,
  postgresConnectionString,
  redactedConnectionString,
} from "./env-loader.mjs";

loadDotEnv();
const connectionString = postgresConnectionString();

async function main() {
  assertLocalDevelopmentDatabase(connectionString);
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("drop table if exists auth_users cascade");
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }

  console.log(
    JSON.stringify({
      status: "reset",
      database: redactedConnectionString(connectionString),
      droppedTables: ["auth_users"],
    }),
  );
  await import("./db-migrate.mjs");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
