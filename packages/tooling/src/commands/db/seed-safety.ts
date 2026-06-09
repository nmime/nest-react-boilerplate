// @ts-nocheck
export const DEFAULT_ADMIN_EMAIL = "admin@example.com";
export const DEFAULT_ADMIN_PASSWORD = "ChangeMe123!";

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value ?? "").trim().toLowerCase(),
  );
}

export function isLocalDevelopmentDatabase(connectionString) {
  const url = new URL(connectionString);
  const host = url.hostname.toLowerCase();
  const database = url.pathname.replace(/^\//u, "");
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);
  const looksLikeDevDb = /(^|_)(dev|test|boilerplate)($|_)/u.test(database);
  return localHosts.has(host) && looksLikeDevDb;
}

export function resolvePassword(args, env = process.env) {
  if (!args.passwordEnv) return args.password;
  const password = env[args.passwordEnv];
  if (!password) {
    throw new Error(`${args.passwordEnv} must contain the seed password.`);
  }
  return password;
}

export function assertSeedSafety(
  args,
  connectionString,
  {
    env = process.env,
    assertLocalDevelopmentDatabase,
  } = {},
) {
  const localDevelopmentDatabase = isLocalDevelopmentDatabase(connectionString);
  const productionRuntime = env.NODE_ENV === "production";
  const defaultSeedCredentials =
    args.email.toLowerCase() === DEFAULT_ADMIN_EMAIL &&
    args.password === DEFAULT_ADMIN_PASSWORD;

  if (!args.force) {
    assertLocalDevelopmentDatabase?.(connectionString);
  }

  if (args.force && !localDevelopmentDatabase) {
    if (!isTruthy(env.DB_SEED_ALLOW_NON_LOCAL)) {
      throw new Error(
        "Refusing --force seed against a non-local/dev database. Set DB_SEED_ALLOW_NON_LOCAL=true only for an intentional, controlled seed operation.",
      );
    }
    if (productionRuntime && !isTruthy(env.DB_SEED_ALLOW_PRODUCTION)) {
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
