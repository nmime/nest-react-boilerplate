import { isTruthyEnv } from "./env-loader.ts";
import { isLocalDevelopmentDatabase } from "./seed-safety.ts";

// Restore is destructive, so --force must clear the same double env-var gate
// that db seed-safety uses before touching a non-local or production database.
export interface RestoreSafetyArgs {
  force?: boolean;
}

export interface RestoreSafetyOptions {
  env?: NodeJS.ProcessEnv;
  assertLocalDevelopmentDatabase?: (connectionString: string) => void;
  isLocalDevelopmentDatabase?: (connectionString: string, env: NodeJS.ProcessEnv) => boolean;
}

export function assertRestoreSafety(
  args: RestoreSafetyArgs,
  connectionString: string,
  {
    env = process.env,
    assertLocalDevelopmentDatabase,
    isLocalDevelopmentDatabase: inspectLocalDatabase = isLocalDevelopmentDatabase,
  }: RestoreSafetyOptions = {},
): void {
  if (!args.force) {
    assertLocalDevelopmentDatabase?.(connectionString);
    return;
  }

  if (inspectLocalDatabase(connectionString, env)) return;

  if (!isTruthyEnv(env.DB_RESTORE_ALLOW_NON_LOCAL)) {
    throw new Error(
      "Refusing --force restore against a non-local/dev database. Restore is destructive; set DB_RESTORE_ALLOW_NON_LOCAL=true only for an intentional, controlled restore operation.",
    );
  }

  if (env.NODE_ENV === "production" && !isTruthyEnv(env.DB_RESTORE_ALLOW_PRODUCTION)) {
    throw new Error(
      "Refusing --force restore in production. Set DB_RESTORE_ALLOW_PRODUCTION=true only for an intentional, controlled production restore operation.",
    );
  }
}
