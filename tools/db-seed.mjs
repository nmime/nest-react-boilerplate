#!/usr/bin/env node
import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import {
  assertLocalDevelopmentDatabase,
  loadDotEnv,
  postgresConnectionString,
  redactedConnectionString,
} from "./env-loader.mjs";

function parseArgs(argv) {
  const args = {
    dryRun: false,
    force: false,
    email: "admin@example.com",
    password: "ChangeMe123!",
    displayName: "Local Admin",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--") continue;
    const val = () => {
      const next = argv[++i];
      if (!next) throw new Error(`${item} requires a value.`);
      return next;
    };
    if (item === "--dry-run") args.dryRun = true;
    else if (item === "--force") args.force = true;
    else if (item === "--email") args.email = val();
    else if (item === "--password") args.password = val();
    else if (item === "--display-name") args.displayName = val();
    else if (item === "--help" || item === "-h") args.help = true;
    else throw new Error(`Unknown option: ${item}`);
  }
  return args;
}

function usage() {
  console.log(
    "Usage: pnpm db:seed -- [--dry-run] [--force] [--email admin@example.com] [--password value]\nSeeds a local/test auth user. Refuses non-local databases unless --force.",
  );
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const digest = pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString(
    "base64url",
  );
  return `pbkdf2_sha256$120000$${salt}$${digest}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  loadDotEnv();
  const connectionString = postgresConnectionString();
  if (!args.force) assertLocalDevelopmentDatabase(connectionString);
  const plan = {
    database: redactedConnectionString(connectionString),
    email: args.email.toLowerCase(),
    roles: ["user", "admin"],
    permissions: ["profile:read", "admin:profile:read", "admin:dashboard:read"],
  };
  if (args.dryRun) {
    console.log(JSON.stringify({ status: "dry-run", plan }, null, 2));
    return;
  }
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const existing = await client.query(
      "select id from auth_users where email = $1",
      [plan.email],
    );
    if (existing.rowCount) {
      console.log(
        JSON.stringify({
          status: "exists",
          database: plan.database,
          email: plan.email,
        }),
      );
      return;
    }
    await client.query(
      `insert into auth_users (id, email, display_name, password_hash, status, roles, permissions) values ($1, $2, $3, $4, 'active', $5::jsonb, $6::jsonb)`,
      [
        randomUUID(),
        plan.email,
        args.displayName,
        hashPassword(args.password),
        JSON.stringify(plan.roles),
        JSON.stringify(plan.permissions),
      ],
    );
    console.log(
      JSON.stringify({
        status: "seeded",
        database: plan.database,
        email: plan.email,
        roles: plan.roles,
      }),
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
