// @ts-nocheck
import { spawnSync } from "node:child_process";
import { relative, resolve } from "node:path";

export const DEFAULT_POSTGRES_CLIENT_IMAGE = "postgres:17-alpine";

export function isTruthy(value) {
  return /^(1|true|yes|on)$/iu.test(String(value ?? "").trim());
}

export function parsePostgresMajorVersion(output) {
  const serverVersionNumber = /^\s*(\d{5,6})\s*$/u.exec(String(output ?? ""));
  if (serverVersionNumber) return Math.trunc(Number(serverVersionNumber[1]) / 10_000);

  const semanticVersion = /(\d+)(?:\.\d+)?/u.exec(String(output ?? ""));
  if (!semanticVersion) return undefined;
  return Number(semanticVersion[1]);
}

export function isPostgresClientVersionMismatch(output) {
  return /server version:.*(?:pg_dump|pg_restore) version:|unsupported version .* in file header|aborting because of server version mismatch/isu.test(
    String(output ?? ""),
  );
}

export function redactCommand(command, connectionString) {
  const redacted = redactConnectionString(connectionString);
  return command.map((part) => (part === connectionString ? redacted : part));
}

export function redactConnectionString(connectionString) {
  try {
    const url = new URL(connectionString);
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return "[redacted database URL]";
  }
}

export function commandExists(command, spawn = spawnSync) {
  const result = spawn("sh", ["-c", `command -v ${quoteForShell(command)}`], {
    encoding: "utf8",
    stdio: "pipe",
  });
  return result.status === 0;
}

export function dockerAvailable(spawn = spawnSync) {
  const result = spawn("docker", ["version", "--format", "{{.Server.Version}}"], {
    encoding: "utf8",
    stdio: "pipe",
    timeout: 10_000,
  });
  return result.status === 0;
}

export function detectLocalClientMajor(tool, spawn = spawnSync) {
  const result = spawn(tool, ["--version"], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0) return undefined;
  return parsePostgresMajorVersion(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
}

export function detectServerMajor(connectionString, spawn = spawnSync) {
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
}) {
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
}) {
  const tool = operation === "backup" ? "pg_dump" : "pg_restore";
  const image = env.DB_BACKUP_DOCKER_IMAGE || env.POSTGRES_CLIENT_DOCKER_IMAGE || DEFAULT_POSTGRES_CLIENT_IMAGE;
  const localClientExists = commandExists(tool, spawn);
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

export function createLocalInvocation({ connectionString, operation, outputPath }) {
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
    "pg_restore",
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-acl",
    "--dbname",
    connectionString,
    outputPath,
  ];
  return {
    args: command.slice(1),
    command: command[0],
    env: process.env,
    redactedCommand: redactCommand(command, connectionString),
  };
}

export function createDockerInvocation({ connectionString, cwd, image, operation, outputPath }) {
  const containerPath = toContainerWorkspacePath(cwd, outputPath);
  const script =
    operation === "backup"
      ? 'exec pg_dump --format=custom --no-owner --no-acl --file "$1" "$DATABASE_URL"'
      : 'exec pg_restore --clean --if-exists --no-owner --no-acl --dbname "$DATABASE_URL" "$1"';
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

export function runPostgresClient({ connectionString, operation, outputPath }) {
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

function runInvocation(invocation) {
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

function forwardOutput(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error && !result.stderr) process.stderr.write(`${result.error.message}\n`);
}

function quoteForShell(value) {
  return `'${String(value).replace(/'/gu, "'\\''")}'`;
}

function toContainerWorkspacePath(cwd, path) {
  const absoluteCwd = resolve(cwd);
  const absolutePath = resolve(absoluteCwd, path);
  const relativePath = relative(absoluteCwd, absolutePath);

  if (relativePath === "") return "/workspace";
  if (relativePath.startsWith("..") || resolve(absolutePath) === absolutePath && relativePath.startsWith("..")) {
    return path;
  }
  return `/workspace/${relativePath.replace(/\\/gu, "/")}`;
}
