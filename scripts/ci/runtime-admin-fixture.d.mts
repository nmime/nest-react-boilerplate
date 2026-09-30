export const RuntimeAdminFixtureEmail: string;
export const RuntimeAdminFixturePassword: string;

export function ownedFixtureConnection(
  config: unknown,
  container: unknown,
  workspaceRoot?: string,
): { provider: 'postgres' | 'mongodb'; uri: string; database: string };

export function seedOwnedRuntimeAdmin(env?: NodeJS.ProcessEnv): Promise<void>;
