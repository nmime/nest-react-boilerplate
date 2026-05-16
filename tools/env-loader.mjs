import { existsSync, readFileSync } from "node:fs";

export function loadDotEnv(file = ".env") {
  if (!existsSync(file)) {
    return;
  }

  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const match = /^(?<key>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)$/u.exec(line);
    if (!match?.groups) {
      continue;
    }
    const { key } = match.groups;
    let { value } = match.groups;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

export function postgresConnectionString() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.POSTGRES_HOST ?? "localhost";
  const port = process.env.POSTGRES_PORT ?? "5432";
  const user = process.env.POSTGRES_USER ?? "postgres";
  const password = process.env.POSTGRES_PASSWORD ?? "postgres";
  const database = process.env.POSTGRES_DB ?? "nest_react_boilerplate";
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(
    password,
  )}@${host}:${port}/${database}`;
}

export function redactedConnectionString(connectionString) {
  const url = new URL(connectionString);
  if (url.password) {
    url.password = "***";
  }
  return url.toString();
}

export function assertLocalDevelopmentDatabase(connectionString) {
  const url = new URL(connectionString);
  const host = url.hostname.toLowerCase();
  const database = url.pathname.replace(/^\//u, "");
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);
  const looksLikeDevDb = /(^|_)(dev|test|boilerplate)($|_)/u.test(database);

  if (!localHosts.has(host) || !looksLikeDevDb) {
    throw new Error(
      `Refusing destructive reset for non-local/dev database ${host}/${database}. Use a disposable local database named with dev/test/boilerplate.`,
    );
  }
}
