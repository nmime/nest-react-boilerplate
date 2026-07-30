import { MongoClient, type MongoClientOptions } from "mongodb";
import ConnectionString from "mongodb-connection-string-url";
import { assertMongoTransactionTopology } from "../../../../../libs/backend/mongodb/main/shared/lib/src/mongo.topology.ts";
import { sharedMongoMigrations } from "../../../../../libs/backend/mongodb/main/shared/lib/src/migrations/index.ts";
import { runMongoMigrations } from "../../../../../libs/backend/mongodb/main/shared/lib/src/migrations/mongo-migration.ts";
import { authMongoMigrations } from "../../../../../libs/backend/mongodb/main/auth/lib/src/migrations/index.ts";
import { featureFlagMongoMigrations } from "../../../../../libs/backend/mongodb/main/feature-flags/lib/src/migrations/index.ts";
import { notificationMongoMigrations } from "../../../../../libs/backend/mongodb/main/notification/lib/src/migrations/index.ts";
import { generatedMongoMigrations } from "./generated-mongo-migrations.ts";

export const mongoMigrations = [
  ...sharedMongoMigrations,
  ...authMongoMigrations,
  ...featureFlagMongoMigrations,
  ...notificationMongoMigrations,
  ...generatedMongoMigrations,
].sort((left, right) => left.id.localeCompare(right.id));

export interface MongoMigrationEnvironment {
  readonly uri: string;
  readonly database: string;
  readonly replicaSet?: string;
}

export function createMongoMigrationEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): MongoMigrationEnvironment {
  const uri = requiredValue(env.MONGODB_URI, "MONGODB_URI");
  const database = requiredValue(env.MONGODB_DATABASE, "MONGODB_DATABASE");
  const parsed = parseMongoUri(uri);
  assertDatabaseName(database);

  const uriDatabase = decodedDatabasePath(parsed);
  if (uriDatabase !== "" && uriDatabase !== database) {
    throw new Error("MONGODB_URI database and MONGODB_DATABASE must match.");
  }

  assertBooleanUriOption(parsed, "directConnection", false);
  assertBooleanUriOption(parsed, "loadBalanced", false);
  assertBooleanUriOption(parsed, "retryWrites", true);
  assertBooleanUriOption(parsed, "journal", true);
  assertBooleanUriOption(parsed, "j", true);
  const writeConcern = uriOption(parsed, "w");
  if (writeConcern !== undefined && writeConcern.toLowerCase() !== "majority") {
    throw new Error("MongoDB write concern cannot be weaker than majority.");
  }

  const uriReplicaSet = uriOption(parsed, "replicaSet");
  const configuredReplicaSet = optionalValue(env.MONGODB_REPLICA_SET);
  if (uriReplicaSet === "") {
    throw new Error("MongoDB replicaSet URI option must not be empty.");
  }
  if (uriReplicaSet !== undefined && configuredReplicaSet !== undefined && uriReplicaSet !== configuredReplicaSet) {
    throw new Error("MONGODB_REPLICA_SET must match the MongoDB URI replicaSet option.");
  }
  const replicaSet = configuredReplicaSet ?? uriReplicaSet;
  if (replicaSet !== undefined && /\s/u.test(replicaSet)) {
    throw new Error("MONGODB_REPLICA_SET must not contain whitespace.");
  }

  return {
    uri,
    database,
    ...(replicaSet === undefined ? {} : { replicaSet }),
  };
}

export async function migrateMongoDatabase(env: NodeJS.ProcessEnv = process.env): Promise<{
  readonly database: string;
  readonly applied: string[];
  readonly skipped: string[];
}> {
  const config = createMongoMigrationEnvironment(env);
  const client = new MongoClient(config.uri, createMongoMigrationClientOptions(config, env));

  try {
    await client.connect();
    await assertMongoTransactionTopology(client, config.replicaSet);
    const result = await runMongoMigrations(client.db(config.database), mongoMigrations);
    return { database: config.database, ...result };
  } finally {
    await client.close();
  }
}

export function createMongoMigrationClientOptions(
  config: MongoMigrationEnvironment,
  env: NodeJS.ProcessEnv = process.env,
): MongoClientOptions {
  return {
    appName: "nrb-db-migrate",
    directConnection: false,
    retryWrites: true,
    writeConcern: { w: "majority" },
    serverSelectionTimeoutMS: positiveInteger(env.MONGODB_SERVER_SELECTION_TIMEOUT_MS, 10_000),
    ...(config.replicaSet === undefined ? {} : { replicaSet: config.replicaSet }),
  };
}

export function parseMongoUri(uri: string): ConnectionString {
  try {
    const parsed = new ConnectionString(uri);
    if (parsed.hosts.some((host) => host.trim() === "")) {
      throw new Error("unsupported");
    }
    return parsed;
  } catch {
    throw new Error("MONGODB_URI must be a valid mongodb:// or mongodb+srv:// URI.");
  }
}

function assertDatabaseName(database: string): void {
  if (Buffer.byteLength(database, "utf8") > 63 || /[\0/\\. "$*<>:|?]/u.test(database)) {
    throw new Error("MONGODB_DATABASE is not a valid MongoDB database name.");
  }
}

function assertBooleanUriOption(parsed: ConnectionString, name: string, required: boolean): void {
  const value = uriOption(parsed, name);
  if (value !== undefined && !["true", "false"].includes(value.toLowerCase())) {
    throw new Error(`MongoDB URI option ${name} must be true or false.`);
  }
  if (value !== undefined && value.toLowerCase() === String(!required)) {
    throw new Error(`MongoDB URI option ${name}=${value.toLowerCase()} is not allowed.`);
  }
}

function decodedDatabasePath(parsed: ConnectionString): string {
  try {
    return decodeURIComponent(parsed.pathname.replace(/^\//u, ""));
  } catch {
    throw new Error("MONGODB_URI contains an invalid encoded database name.");
  }
}

function uriOption(parsed: ConnectionString, name: string): string | undefined {
  const values = [...parsed.searchParams.entries()]
    .filter(([candidate]) => candidate.toLowerCase() === name.toLowerCase())
    .map(([, value]) => value);
  if (values.some((value) => value !== values[0])) {
    throw new Error(`MongoDB URI option ${name} must not have conflicting values.`);
  }
  return values[0];
}

function requiredValue(value: string | undefined, name: string): string {
  const normalized = optionalValue(value);
  if (normalized === undefined) {
    throw new Error(`${name} is required for MongoDB migrations.`);
  }
  return normalized;
}

function optionalValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === "" ? undefined : normalized;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("MONGODB_SERVER_SELECTION_TIMEOUT_MS must be a positive integer.");
  }
  return parsed;
}
