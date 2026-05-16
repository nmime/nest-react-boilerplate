#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import {
  loadDotEnv,
  postgresConnectionString,
  redactedConnectionString,
} from "./env-loader.mjs";

loadDotEnv();
const migrationsDir =
  process.env.AUTH_MIGRATIONS_DIR ?? "libs/postgres/main/auth/migrations";
const connectionString = postgresConnectionString();

async function main() {
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  if (files.length === 0) {
    throw new Error(`No SQL migrations found in ${migrationsDir}`);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("begin");
    for (const file of files) {
      const sql = await readFile(join(migrationsDir, file), "utf8");
      await client.query(sql);
      console.log(`applied ${file}`);
    }
    await client.query("commit");
    console.log(
      JSON.stringify({
        status: "ok",
        migrations: files.length,
        database: redactedConnectionString(connectionString),
      }),
    );
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
