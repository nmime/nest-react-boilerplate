import { isTruthy } from "./postgres-client.ts";
import { isLocalDevelopmentDatabase } from "./seed-safety.ts";

// pg_restore --clean is more destructive than seeding, so --force must clear the
// same double env-var gate that db seed-safety uses before touching a non-local
// or production database.
export interface RestoreSafetyArgs {
  force?: boolean;
}

export interface RestoreSafetyOptions {
  env?: NodeJS.ProcessEnv;
  assertLocalDevelopmentDatabase?: (connectionString: string) => void;
}

export function assertRestoreSafety(
  args: RestoreSafetyArgs,
  connectionString: string,
  { env = process.env, assertLocalDevelopmentDatabase }: RestoreSafetyOptions = {},
): void {
  if (!args.force) {
    assertLocalDevelopmentDatabase?.(connectionString);
    return;
  }

  if (isLocalDevelopmentDatabase(connectionString)) return;

  if (!isTruthy(env.DB_RESTORE_ALLOW_NON_LOCAL)) {
    throw new Error(
      "Refusing --force restore against a non-local/dev database. pg_restore --clean is destructive; set DB_RESTORE_ALLOW_NON_LOCAL=true only for an intentional, controlled restore operation.",
    );
  }

  if (env.NODE_ENV === "production" && !isTruthy(env.DB_RESTORE_ALLOW_PRODUCTION)) {
    throw new Error(
      "Refusing --force restore in production. Set DB_RESTORE_ALLOW_PRODUCTION=true only for an intentional, controlled production restore operation.",
    );
  }
}
