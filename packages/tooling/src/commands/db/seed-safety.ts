export const DefaultAdminEmail = "admin@example.com";
export const DefaultAdminPassword = "ChangeMe123!";

export interface SeedSafetyArgs {
  email: string;
  password: string;
  force?: boolean;
}

export interface SeedSafetyOptions {
  env?: NodeJS.ProcessEnv;
  assertLocalDevelopmentDatabase?: (connectionString: string) => void;
}

function isTruthy(value: unknown): boolean {
  return ["1", "true", "yes", "on"].includes(
    String(value ?? "").trim().toLowerCase(),
  );
}

export function isLocalDevelopmentDatabase(connectionString: string): boolean {
  const url = new URL(connectionString);
  const host = url.hostname.toLowerCase();
  const database = url.pathname.replace(/^\//u, "");
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);
  const looksLikeDevDb = /(^|_)(dev|test|boilerplate)($|_)/u.test(database);
  return localHosts.has(host) && looksLikeDevDb;
}

export function resolvePassword(
  args: { passwordEnv?: string; password?: string },
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (!args.passwordEnv) return args.password;
  const password = env[args.passwordEnv];
  if (!password) {
    throw new Error(`${args.passwordEnv} must contain the seed password.`);
  }
  return password;
}

export function assertSeedSafety(
  args: SeedSafetyArgs,
  connectionString: string,
  { env = process.env, assertLocalDevelopmentDatabase }: SeedSafetyOptions = {},
): void {
  const localDevelopmentDatabase = isLocalDevelopmentDatabase(connectionString);
  const productionRuntime = env.NODE_ENV === "production";
  const defaultSeedCredentials =
    args.email.toLowerCase() === DefaultAdminEmail &&
    args.password === DefaultAdminPassword;

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
