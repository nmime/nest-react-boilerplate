import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { createMongoMigrationEnvironment, parseMongoUri } from "./mongo-migrate.ts";
import { isTruthyEnv } from "./env-loader.ts";

export const DefaultMongoDatabaseToolsVersion = "100.17.0";
export const DefaultMongoDatabaseToolsImage = "mongo:8.0.28-noble";

type SpawnSync = typeof spawnSync;
export type MongoArchiveOperation = "backup" | "restore";

export interface MongoClientInvocation {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  redactedCommand: string[];
}

interface MongoClientSelectionInput {
  dockerAvailable: boolean;
  forceDocker: boolean;
  localClientExists: boolean;
  localVersion: string | undefined;
}

export function createMongoOperationEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const config = createMongoMigrationEnvironment(env);
  const parsed = parseMongoUri(config.uri);
  const replicaSets = [...parsed.searchParams.entries()]
    .filter(([name]) => name.toLowerCase() === "replicaset")
    .map(([, value]) => value);

  if (replicaSets.length === 0 || replicaSets[0]?.trim() === "") {
    throw new Error(
      "MONGODB_URI must include an explicit replicaSet option for database operations.",
    );
  }

  return { ...config, replicaSet: replicaSets[0] };
}

export function createMongoArchiveEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const configuredUri = env.MONGODB_BACKUP_RESTORE_URI?.trim();
  const configuredUriFile = env.MONGODB_BACKUP_RESTORE_URI_FILE?.trim();
  const configuredPasswordFile = env.MONGODB_BACKUP_RESTORE_PASSWORD_FILE?.trim();
  if (!configuredUri && !configuredUriFile && !configuredPasswordFile) {
    return createMongoOperationEnvironment(env);
  }

  let uri = configuredUri;
  if (!uri && configuredUriFile) {
    try {
      uri = readFileSync(configuredUriFile, "utf8").trim();
    } catch {
      // Bundled Compose derives its internal URI from the separately mounted password.
    }
  }
  if (!uri && configuredPasswordFile) {
    let password: string;
    try {
      password = readFileSync(configuredPasswordFile, "utf8").trim();
    } catch {
      throw new Error(
        "MONGODB_BACKUP_RESTORE_URI_FILE or MONGODB_BACKUP_RESTORE_PASSWORD_FILE must point to a readable secret.",
      );
    }
    if (!password) throw new Error("The MongoDB backup/restore password secret must not be empty.");
    const bundledUri = new URL(
      `mongodb://${env.MONGODB_HOST?.trim() || "mongodb"}:${env.MONGODB_PORT?.trim() || "27017"}/`,
    );
    bundledUri.username = env.MONGODB_BACKUP_RESTORE_USER?.trim() || "nrb_backup_restore";
    bundledUri.password = password;
    bundledUri.searchParams.set("authSource", "admin");
    bundledUri.searchParams.set("replicaSet", env.MONGODB_REPLICA_SET?.trim() || "rs0");
    bundledUri.searchParams.set("retryWrites", "true");
    uri = bundledUri.toString();
  }
  if (!uri) throw new Error("The MongoDB backup/restore URI secret must not be empty.");

  const config = createMongoOperationEnvironment({ ...env, MONGODB_URI: uri });
  const parsed = parseMongoUri(uri);
  if (decodeURIComponent(parsed.pathname.replace(/^\//u, "")) !== "") {
    throw new Error(
      "MONGODB_BACKUP_RESTORE_URI must be deployment-wide and must not select a database path.",
    );
  }
  if (parsed.searchParams.get("authSource")?.toLowerCase() !== "admin") {
    throw new Error("MONGODB_BACKUP_RESTORE_URI must use authSource=admin.");
  }

  return { ...config, database: undefined };
}

export function redactMongoConnectionString(connectionString: string): string {
  try {
    const url = parseMongoUri(connectionString);
    if (url.password) url.password = "***";
    for (const [name] of url.searchParams) {
      if (/(?:password|secret|token|credential|private.?key)/iu.test(name)) {
        url.searchParams.set(name, "***");
      }
    }
    return url.toString();
  } catch {
    return "[redacted MongoDB URI]";
  }
}

export function isLocalMongoDatabase(
  connectionString: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.NODE_ENV === "production") return false;
  const url = parseMongoUri(connectionString);
  const hosts = url.hosts.map(normalizedMongoHost);
  const database = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "mongo", "mongodb", "mongodb.localhost"]);
  return hosts.every((host) => localHosts.has(host)) && /(^|_)(dev|test|boilerplate)($|_)/u.test(database);
}

export function assertLocalMongoDatabase(
  connectionString: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const url = parseMongoUri(connectionString);
  const hosts = url.hosts.map(normalizedMongoHost);
  const database = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  const displayHost = hosts.join(",");
  if (env.NODE_ENV === "production" && !isTruthyEnv(env.DB_ALLOW_DESTRUCTIVE)) {
    throw new Error(
      `Refusing destructive database operation while NODE_ENV=production (${displayHost}/${database}). The local host/name heuristic is not trusted here because production uses the same host and db name. Set DB_ALLOW_DESTRUCTIVE=true only for an intentional, controlled operation.`,
    );
  }
  if (!isLocalMongoDatabase(connectionString, { ...env, NODE_ENV: undefined })) {
    throw new Error(
      `Refusing destructive reset for non-local/dev database ${displayHost}/${database}. Use a disposable local database named with dev/test/boilerplate.`,
    );
  }
}

export function parseMongoDatabaseToolsVersion(output: string | undefined): string | undefined {
  return /(?:version:\s*|database tools version:\s*v?)(\d+\.\d+\.\d+)/iu.exec(
    String(output ?? ""),
  )?.[1];
}

export function selectMongoClientMode({
  dockerAvailable: hasDocker,
  forceDocker,
  localClientExists,
  localVersion,
}: MongoClientSelectionInput): { mode: "docker" | "local" | "missing"; reason?: string; warning?: string } {
  if (forceDocker) {
    return hasDocker
      ? { mode: "docker", reason: "MongoDB Database Tools Docker mode requested" }
      : {
          mode: "missing",
          warning: "Docker was requested, but it is unavailable.",
        };
  }
  if (localClientExists && localVersion === DefaultMongoDatabaseToolsVersion) {
    return { mode: "local" };
  }
  if (hasDocker) {
    return {
      mode: "docker",
      reason: localClientExists
        ? `local MongoDB Database Tools ${localVersion ?? "version unknown"} do not match pinned ${DefaultMongoDatabaseToolsVersion}`
        : "local MongoDB Database Tools are unavailable",
    };
  }
  return {
    mode: "missing",
    warning: `MongoDB Database Tools ${DefaultMongoDatabaseToolsVersion} and Docker fallback are unavailable.`,
  };
}

export function createMongoLocalInvocation({
  connectionString,
  database,
  operation,
  archivePath,
}: {
  connectionString: string;
  database?: string;
  operation: MongoArchiveOperation;
  archivePath: string;
}): MongoClientInvocation {
  const script = mongoArchiveScript(operation, database !== undefined);
  const invocationConnectionString = database === undefined
    ? deploymentConnectionString(connectionString)
    : connectionString;
  const command = [
    "sh",
    "-ec",
    script,
    "mongo-client",
    archivePath,
    ...(database === undefined ? [] : [database]),
  ];
  return {
    command: command[0],
    args: command.slice(1),
    env: { ...process.env, MONGODB_URI: invocationConnectionString },
    redactedCommand: command,
  };
}

export function createMongoDockerInvocation({
  connectionString,
  database,
  operation,
  archivePath,
  image = DefaultMongoDatabaseToolsImage,
  network = "host",
}: {
  connectionString: string;
  database?: string;
  operation: MongoArchiveOperation;
  archivePath: string;
  image?: string;
  network?: string;
}): MongoClientInvocation {
  const absoluteArchive = resolve(archivePath);
  const containerArchive = `/backup/${basename(absoluteArchive)}`;
  const invocationConnectionString = database === undefined
    ? deploymentConnectionString(connectionString)
    : connectionString;
  const command = [
    "docker",
    "run",
    "--rm",
    "--network",
    network,
    ...(network === "host" ? ["--add-host", "mongodb.localhost:host-gateway"] : []),
    "--volume",
    `${dirname(absoluteArchive)}:/backup`,
    "--workdir",
    "/backup",
    "--env",
    "MONGODB_URI",
    "--entrypoint",
    "sh",
    image,
    "-ec",
    mongoArchiveScript(operation, database !== undefined),
    "mongo-client",
    containerArchive,
    ...(database === undefined ? [] : [database]),
  ];
  return {
    command: command[0],
    args: command.slice(1),
    env: { ...process.env, MONGODB_URI: invocationConnectionString },
    redactedCommand: command,
  };
}

export function createMongoClientInvocation({
  connectionString,
  database,
  operation,
  archivePath,
  env = process.env,
  spawn = spawnSync,
}: {
  connectionString: string;
  database?: string;
  operation: MongoArchiveOperation;
  archivePath: string;
  env?: NodeJS.ProcessEnv;
  spawn?: SpawnSync;
}) {
  const tool = operation === "backup" ? "mongodump" : "mongorestore";
  const versionResult = spawn(tool, ["--version"], { encoding: "utf8", stdio: "pipe" });
  const localClientExists = versionResult.status === 0;
  const localVersion = localClientExists
    ? parseMongoDatabaseToolsVersion(`${versionResult.stdout ?? ""}\n${versionResult.stderr ?? ""}`)
    : undefined;
  const dockerResult = spawn("docker", ["version", "--format", "{{.Server.Version}}"], {
    encoding: "utf8",
    stdio: "pipe",
    timeout: 10_000,
  });
  const selection = selectMongoClientMode({
    dockerAvailable: dockerResult.status === 0,
    forceDocker: isTruthyEnv(env.MONGODB_DATABASE_TOOLS_USE_DOCKER ?? env.DB_BACKUP_USE_DOCKER),
    localClientExists,
    localVersion,
  });
  const local = createMongoLocalInvocation({ connectionString, database, operation, archivePath });
  const docker = createMongoDockerInvocation({
    connectionString,
    database,
    operation,
    archivePath,
    network: env.MONGODB_DATABASE_TOOLS_DOCKER_NETWORK?.trim() || "host",
  });

  return {
    ...selection,
    image: DefaultMongoDatabaseToolsImage,
    local,
    docker,
    localClientExists,
    localVersion,
    selected: selection.mode === "docker" ? docker : local,
  };
}

export function runMongoClient(input: {
  connectionString: string;
  database?: string;
  operation: MongoArchiveOperation;
  archivePath: string;
}): number {
  const plan = createMongoClientInvocation(input);
  if (plan.warning) console.warn(plan.warning);
  if (plan.mode === "missing") return 1;
  const result = spawnSync(plan.selected.command, plan.selected.args, {
    encoding: "utf8",
    env: plan.selected.env,
    stdio: "pipe",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error && !result.stderr) process.stderr.write(`${result.error.message}\n`);
  return result.status ?? (result.error ? 1 : 0);
}

function mongoArchiveScript(operation: MongoArchiveOperation, databaseScoped: boolean): string {
  if (operation === "backup") {
    return databaseScoped
      ? 'exec mongodump --uri "$MONGODB_URI" --db "$2" --archive="$1" --gzip'
      : 'exec mongodump --uri "$MONGODB_URI" --archive="$1" --gzip --oplog';
  }
  return databaseScoped
    ? 'exec mongorestore --uri "$MONGODB_URI" --archive="$1" --gzip --drop --stopOnError --nsInclude="$2.*"'
    : 'exec mongorestore --uri "$MONGODB_URI" --archive="$1" --gzip --drop --stopOnError --oplogReplay';
}

function deploymentConnectionString(connectionString: string): string {
  const url = parseMongoUri(connectionString);
  const database = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  if (url.username && database && ![...url.searchParams.keys()].some((key) => key.toLowerCase() === "authsource")) {
    url.searchParams.set("authSource", database);
  }
  url.pathname = "/";
  return url.toString();
}

function normalizedMongoHost(host: string): string {
  if (host.startsWith("[")) return host.slice(1, host.indexOf("]")).toLowerCase();
  return host.replace(/:\d+$/u, "").toLowerCase();
}
