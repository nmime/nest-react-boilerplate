#!/usr/bin/env node
import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import {
  assertLocalDevelopmentDatabase,
  loadDotEnv,
  postgresConnectionString,
  redactedConnectionString,
} from "./env-loader.mjs";

const DEFAULT_ADMIN_EMAIL = "admin@example.com";
const DEFAULT_ADMIN_PASSWORD = "ChangeMe123!";

function parseArgs(argv) {
  const args = {
    dryRun: false,
    force: false,
    email: DEFAULT_ADMIN_EMAIL,
    password: DEFAULT_ADMIN_PASSWORD,
    passwordEnv: "",
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
    else if (item === "--password-env") args.passwordEnv = val();
    else if (item === "--display-name") args.displayName = val();
    else if (item === "--help" || item === "-h") args.help = true;
    else throw new Error(`Unknown option: ${item}`);
  }
  return args;
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const digest = pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString(
    "base64url",
  );
  return `pbkdf2_sha256$120000$${salt}$${digest}`;
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value ?? "").trim().toLowerCase(),
  );
}

function isLocalDevelopmentDatabase(connectionString) {
  const url = new URL(connectionString);
  const host = url.hostname.toLowerCase();
  const database = url.pathname.replace(/^\//u, "");
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);
  const looksLikeDevDb = /(^|_)(dev|test|boilerplate)($|_)/u.test(database);
  return localHosts.has(host) && looksLikeDevDb;
}

function resolvePassword(args) {
  if (!args.passwordEnv) return args.password;
  const password = process.env[args.passwordEnv];
  if (!password) throw new Error(`${args.passwordEnv} must contain the seed password.`);
  return password;
}

function assertSeedSafety(args, connectionString) {
  const localDevelopmentDatabase = isLocalDevelopmentDatabase(connectionString);
  const productionRuntime = process.env.NODE_ENV === "production";
  const defaultSeedCredentials =
    args.email.toLowerCase() === DEFAULT_ADMIN_EMAIL &&
    args.password === DEFAULT_ADMIN_PASSWORD;

  if (!args.force) {
    assertLocalDevelopmentDatabase(connectionString);
  }

  if (args.force && !localDevelopmentDatabase) {
    if (!isTruthy(process.env.DB_SEED_ALLOW_NON_LOCAL)) {
      throw new Error(
        "Refusing --force seed against a non-local/dev database. Set DB_SEED_ALLOW_NON_LOCAL=true only for an intentional, controlled seed operation.",
      );
    }
    if (productionRuntime && !isTruthy(process.env.DB_SEED_ALLOW_PRODUCTION)) {
      throw new Error(
        "Refusing --force seed in production. Set DB_SEED_ALLOW_PRODUCTION=true only for an intentional, controlled production seed operation.",
      );
    }
  }

  if ((productionRuntime || !localDevelopmentDatabase) && defaultSeedCredentials) {
    throw new Error(
      "Default seed admin credentials are not allowed for production or non-local databases. Pass --email and a strong --password or --password-env value.",
    );
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(
    "Usage: pnpm db:seed -- [--dry-run] [--force] [--email admin@example.com] [--password value | --password-env ENV_VAR]",
  );
  process.exit(0);
}

loadDotEnv();
args.password = resolvePassword(args);
const connectionString = postgresConnectionString();
assertSeedSafety(args, connectionString);

const plan = {
  database: redactedConnectionString(connectionString),
  email: args.email.toLowerCase(),
  roles: ["user", "admin"],
  permissions: ["profile:read", "admin:profile:read", "admin:dashboard:read"],
};

if (args.dryRun) {
  console.log(JSON.stringify({ status: "dry-run", plan }, null, 2));
  process.exit(0);
}

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const existing = await client.query("select id from auth_users where email = $1", [
    plan.email,
  ]);
  if (existing.rowCount) {
    console.log(
      JSON.stringify({ status: "exists", database: plan.database, email: plan.email }),
    );
    process.exit(0);
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
