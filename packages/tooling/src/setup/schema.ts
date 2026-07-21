/**
 * Versioned Zod configuration schema for the boilerplate setup engine.
 *
 * Only the latest major schema version is accepted.  Unknown top-level keys
 * are rejected.  Every field is validated against an explicit enum so that
 * unsupported app / capability IDs are caught at parse time rather than
 * silently ignored.
 *
 * Zod is consumed from the root workspace `node_modules` — the integration
 * owner adds a direct dependency in `packages/tooling/package.json` after
 * this slice ships.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Public enums — derive IDs from the actual repo.
// ---------------------------------------------------------------------------

/** Frontend application shells that can be enabled / disabled. */
export const frontendAppIds = ['admin-app', 'user-app', 'landing-app', 'site-app', 'mobile-app'] as const;
export type FrontendAppId = (typeof frontendAppIds)[number];

/** Backend services that can be enabled / disabled. */
export const backendAppIds = [
  'admin-app-api',
  'user-app-api',
  'auth-app-api',
  'discord-app-api',
  'telegram-bot-api',
  'notification-scheduler',
] as const;
export type BackendAppId = (typeof backendAppIds)[number];

/** All application IDs (union of frontend + backend + e2e). */
export const appIds = [...frontendAppIds, ...backendAppIds, 'fullstack-e2e'] as const;
export type AppId = (typeof appIds)[number];

/** Cross-cutting capabilities that can be toggled. */
export const capabilityIds = [
  'i18n',
  'analytics',
  'websockets',
  'feature-flags',
  'notifications',
  'design-tokens',
  'authz',
  'postgres',
  'redis',
  's3',
  'static-data',
  'nats',
  'otel',
  'swagger',
  'telegram-bot',
  'discord-bot',
] as const;
export type CapabilityId = (typeof capabilityIds)[number];

/** Supported preset names — deterministic, expandable to apps + capabilities. */
export const presetIds = ['minimal', 'web', 'fullstack', 'enterprise', 'bots'] as const;
export type PresetId = (typeof presetIds)[number];

// ---------------------------------------------------------------------------
// Schema versioning
// ---------------------------------------------------------------------------

export const schemaVersion = '1.0.0' as const;

/**
 * The root configuration schema.
 *
 * - `schemaVersion` MUST equal the current major version string.
 * - `preset` is an optional exact shortcut; the CLI materializes it into a
 *   custom selection before additive/removal updates.
 * - `apps` is a flat string[] restricted to known IDs.
 * - `capabilities` is a flat string[] restricted to known IDs.
 * - `options` holds boolean toggles for generation behaviour.
 * - Passthrough is NOT used — unknown keys are rejected with a clear error.
 */
export const NrbConfigSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    preset: z.enum(presetIds).optional(),
    apps: z.array(z.enum(appIds)).default([]),
    capabilities: z.array(z.enum(capabilityIds)).default([]),
    options: z
      .object({
        /** When true, prune files that are no longer needed after config change. */
        prune: z.boolean().default(false),
        /** When true, force overwrite generated files without conflict check. */
        force: z.boolean().default(false),
        /** When true, output the plan as JSON instead of executing. */
        dryRun: z.boolean().default(false),
        /** When true, do not prompt interactively (CI-friendly). */
        nonInteractive: z.boolean().default(false),
      })
      .strict()
      .default({ prune: false, force: false, dryRun: false, nonInteractive: false }),
  })
  .strict();

export type NrbConfig = z.infer<typeof NrbConfigSchema>;

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Parse raw input into a validated `NrbConfig`.
 *
 * @throws {z.ZodError} when the input shape or values are invalid.
 */
export function parseNrbConfig(raw: unknown): NrbConfig {
  return NrbConfigSchema.parse(raw);
}

/**
 * Safely parse; returns `{ success, data }` or `{ success, error }`.
 */
export function safeParseNrbConfig(
  raw: unknown,
): { success: true; data: NrbConfig } | { success: false; error: z.ZodError } {
  const result = NrbConfigSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
