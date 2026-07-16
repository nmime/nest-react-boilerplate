import { spawnSync } from "node:child_process";
import { relative, resolve } from "node:path";

// Keep the fallback tag identical to the Compose runtime image. Docker can then
// reuse the image that the runtime stack already pulled instead of performing a
// second registry request during backup/restore gates.
export const DefaultPostgresClientImage = "postgres:17.6-alpine";

type SpawnSync = typeof spawnSync;
type PostgresOperation = "backup" | "restore";

interface PostgresClientSelectionInput {
  dockerAvailable: boolean;
  forceDocker: boolean;
  localClientExists: boolean;
  localMajor: number | undefined;
  serverMajor: number | undefined;
}

interface PostgresClientSelection {
  mode: "docker" | "local" | "missing";
  reason?: string;
  warning?: string;
}

interface PostgresInvocation {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  redactedCommand: string[];
}

interface InvocationResult {
  error?: Error;
  status: number;
  stderr: string;
  stdout: string;
}

export function isTruthy(value: unknown): boolean {
  return /^(1|true|yes|on)$/iu.test(String(value ?? "").trim());
}

export function parsePostgresMajorVersion(output: string | undefined): number | undefined {
  const serverVersionNumber = /^\s*(\d{5,6})\s*$/u.exec(String(output ?? ""));
  if (serverVersionNumber) return Math.trunc(Number(serverVersionNumber[1]) / 10_000);

  const semanticVersion = /(\d+)(?:\.\d+)?/u.exec(String(output ?? ""));
  if (!semanticVersion) return undefined;
  return Number(semanticVersion[1]);
}

export function isPostgresClientVersionMismatch(output: string | undefined): boolean {
  return /server version:.*(?:pg_dump|pg_restore) version:|unsupported version .* in file header|aborting because of server version mismatch/isu.test(
    String(output ?? ""),
  );
}

export function redactCommand(command: string[], connectionString: string): string[] {
  const redacted = redactConnectionString(connectionString);
  return command.map((part) => (part === connectionString ? redacted : part));
}

export function redactConnectionString(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return "[redacted database URL]";
  }
}

export function commandExists(command: string, spawn: SpawnSync = spawnSync): boolean {
  const result = spawn("sh", ["-c", `command -v ${quoteForShell(command)}`], {
    encoding: "utf8",
    stdio: "pipe",
  });
  return result.status === 0;
}

export function dockerAvailable(spawn: SpawnSync = spawnSync): boolean {
  const result = spawn("docker", ["version", "--format", "{{.Server.Version}}"], {
    encoding: "utf8",
    stdio: "pipe",
    timeout: 10_000,
  });
  return result.status === 0;
}

export function detectLocalClientMajor(tool: string, spawn: SpawnSync = spawnSync): number | undefined {
  const result = spawn(tool, ["--version"], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0) return undefined;
  return parsePostgresMajorVersion(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
}

export function detectServerMajor(connectionString: string, spawn: SpawnSync = spawnSync): number | undefined {
  if (!commandExists("psql", spawn)) return undefined;

  const result = spawn(
    "psql",
    [
      connectionString,
      "--no-psqlrc",
      "--tuples-only",
      "--no-align",
      "--command",
      "SHOW server_version_num",
    ],
    { encoding: "utf8", stdio: "pipe" },
  );

  if (result.status !== 0) return undefined;
  return parsePostgresMajorVersion(result.stdout);
}

export function selectPostgresClientMode({
  dockerAvailable: hasDocker,
  forceDocker,
  localClientExists,
  localMajor,
  serverMajor,
}: PostgresClientSelectionInput): PostgresClientSelection {
  if (forceDocker) {
    if (hasDocker) return { mode: "docker", reason: "DB_BACKUP_USE_DOCKER requested" };
    if (localClientExists) {
      return {
        mode: "local",
        warning:
          "DB_BACKUP_USE_DOCKER was requested, but Docker is unavailable; falling back to the local PostgreSQL client.",
      };
    }
    return { mode: "missing", warning: "Docker and the local PostgreSQL client are unavailable." };
  }

  if (!localClientExists) {
    if (hasDocker) return { mode: "docker", reason: "local PostgreSQL client unavailable" };
    return { mode: "missing", warning: "Local PostgreSQL client and Docker fallback are unavailable." };
  }

  if (localMajor && serverMajor && localMajor !== serverMajor) {
    if (hasDocker) {
      return {
        mode: "docker",
        reason: `PostgreSQL client major ${localMajor} does not match server major ${serverMajor}`,
      };
    }
    return {
      mode: "local",
      warning: `PostgreSQL client major ${localMajor} does not match server major ${serverMajor}, and Docker is unavailable; using the local client may fail.`,
    };
  }

  return { mode: "local" };
}

export function createPostgresClientInvocation({
  connectionString,
  cwd = process.cwd(),
  env = process.env,
  operation,
  outputPath,
  spawn = spawnSync,
}: {
  connectionString: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  operation: PostgresOperation;
  outputPath: string;
  spawn?: SpawnSync;
}) {
  const tool = operation === "backup" ? "pg_dump" : "pg_restore";
  const image = env.DB_BACKUP_DOCKER_IMAGE || env.POSTGRES_CLIENT_DOCKER_IMAGE || DefaultPostgresClientImage;
  const localClientExists = commandExists(tool, spawn) && (operation === "backup" || commandExists("psql", spawn));
  const hasDocker = dockerAvailable(spawn);
  const localMajor = localClientExists ? detectLocalClientMajor(tool, spawn) : undefined;
  const serverMajor = detectServerMajor(connectionString, spawn);
  const selection = selectPostgresClientMode({
    dockerAvailable: hasDocker,
    forceDocker: isTruthy(env.DB_BACKUP_USE_DOCKER),
    localClientExists,
    localMajor,
    serverMajor,
  });
  const local = createLocalInvocation({ connectionString, operation, outputPath });
  const docker = createDockerInvocation({ connectionString, cwd, image, operation, outputPath });

  return {
    ...selection,
    docker,
    image,
    local,
    localClientExists,
    localMajor,
    serverMajor,
    selected: selection.mode === "docker" ? docker : local,
  };
}

export function createLocalInvocation({ connectionString, operation, outputPath }: { connectionString: string; operation: PostgresOperation; outputPath: string }): PostgresInvocation {
  if (operation === "backup") {
    const command = [
      "pg_dump",
      "--format=custom",
      "--no-owner",
      "--no-acl",
      "--file",
      outputPath,
      connectionString,
    ];
    return {
      args: command.slice(1),
      command: command[0],
      env: process.env,
      redactedCommand: redactCommand(command, connectionString),
    };
  }

  const command = [
    "sh",
    "-ec",
    restoreScript(),
    "postgres-client",
    outputPath,
  ];
  return {
    args: command.slice(1),
    command: command[0],
    env: { ...process.env, DATABASE_URL: connectionString },
    redactedCommand: command,
  };
}

export function createDockerInvocation({ connectionString, cwd, image, operation, outputPath }: { connectionString: string; cwd: string; image: string; operation: PostgresOperation; outputPath: string }): PostgresInvocation {
  const containerPath = toContainerWorkspacePath(cwd, outputPath);
  const script =
    operation === "backup"
      ? 'exec pg_dump --format=custom --no-owner --no-acl --file "$1" "$DATABASE_URL"'
      : restoreScript();
  const command = [
    "docker",
    "run",
    "--rm",
    "--network",
    "host",
    "--volume",
    `${cwd}:/workspace`,
    "--workdir",
    "/workspace",
    "--env",
    "DATABASE_URL",
    image,
    "sh",
    "-ec",
    script,
    "postgres-client",
    containerPath,
  ];

  return {
    args: command.slice(1),
    command: command[0],
    env: { ...process.env, DATABASE_URL: connectionString },
    redactedCommand: command,
  };
}

function restoreScript(): string {
  // pg_restore --clean cannot drop inherited constraints directly from child
  // partitions and exits non-zero even when it later restores the archive. A
  // restore is already a destructive, explicitly-confirmed operation, so reset
  // the application schema atomically first and then fail on any real archive
  // error. This works for both local clients and the version-matched Docker
  // fallback.
  return `psql "$DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --command 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;' && exec pg_restore --exit-on-error --no-owner --no-acl --dbname "$DATABASE_URL" "$1"`;
}

export function runPostgresClient({ connectionString, operation, outputPath }: { connectionString: string; operation: PostgresOperation; outputPath: string }): number {
  const plan = createPostgresClientInvocation({ connectionString, operation, outputPath });

  if (plan.warning) console.warn(plan.warning);
  if (plan.mode === "missing") return 1;

  const first = plan.selected;
  const firstResult = runInvocation(first);
  const combinedOutput = `${firstResult.stdout ?? ""}\n${firstResult.stderr ?? ""}`;
  if (firstResult.status === 0) {
    forwardOutput(firstResult);
    return 0;
  }

  if (plan.mode === "local" && isPostgresClientVersionMismatch(combinedOutput) && dockerAvailable()) {
    console.warn(
      `Local ${operation === "backup" ? "pg_dump" : "pg_restore"} version is incompatible with the PostgreSQL server; retrying with ${plan.image}.`,
    );
    const dockerResult = runInvocation(plan.docker);
    forwardOutput(dockerResult);
    return dockerResult.status ?? 1;
  }

  forwardOutput(firstResult);
  return firstResult.status ?? 1;
}

function runInvocation(invocation: PostgresInvocation): InvocationResult {
  const result = spawnSync(invocation.command, invocation.args, {
    encoding: "utf8",
    env: invocation.env,
    stdio: "pipe",
  });

  return {
    error: result.error,
    status: result.status ?? (result.error ? 1 : 0),
    stderr: result.stderr ?? (result.error ? String(result.error.message ?? result.error) : ""),
    stdout: result.stdout ?? "",
  };
}

function forwardOutput(result: InvocationResult): void {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error && !result.stderr) process.stderr.write(`${result.error.message}\n`);
}

function quoteForShell(value: string): string {
  return `'${String(value).replace(/'/gu, "'\\''")}'`;
}

function toContainerWorkspacePath(cwd: string, path: string): string {
  const absoluteCwd = resolve(cwd);
  const absolutePath = resolve(absoluteCwd, path);
  const relativePath = relative(absoluteCwd, absolutePath);

  if (relativePath === "") return "/workspace";
  if (relativePath.startsWith("..") || resolve(absolutePath) === absolutePath && relativePath.startsWith("..")) {
    return path;
  }
  return `/workspace/${relativePath.replace(/\\/gu, "/")}`;
}
