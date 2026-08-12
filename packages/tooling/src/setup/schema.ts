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
  'notification-consumer',
  'notification-scheduler',
] as const;
export type BackendAppId = (typeof backendAppIds)[number];

/** All application IDs (union of frontend + backend + e2e). */
export const appIds = [...frontendAppIds, ...backendAppIds, 'fullstack-e2e', 'acceptance-e2e'] as const;
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
  'mongodb',
  'redis',
  's3',
  'static-data',
  'nats',
  'otel',
  'swagger',
  'telegram-bot',
  'discord-bot',
  'tenancy',
] as const;
export type CapabilityId = (typeof capabilityIds)[number];

export const ciModeIds = ['product', 'maintainer'] as const;
export type CiMode = (typeof ciModeIds)[number];
export const frontendApiModeIds = ['same-origin', 'split-origin'] as const;
export type FrontendApiMode = (typeof frontendApiModeIds)[number];
export const mobileTargetIds = ['web', 'android', 'ios'] as const;
export type MobileTarget = (typeof mobileTargetIds)[number];
export const deploymentTargetIds = ['docker', 'single-server', 'kubernetes'] as const;
export type DeploymentTarget = (typeof deploymentTargetIds)[number];
export const publicTopologyIds = ['single-domain', 'per-app-domains', 'external-proxy'] as const;
export type PublicTopology = (typeof publicTopologyIds)[number];
export const kubernetesDeliveryIds = ['direct', 'argocd', 'flux'] as const;
export type KubernetesDelivery = (typeof kubernetesDeliveryIds)[number];
export const infrastructureOwnershipIds = ['bundled', 'external'] as const;
export type InfrastructureOwnership = (typeof infrastructureOwnershipIds)[number];

const dnsLabelPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;

/**
 * The public base name a deployment is reachable under. A single label (`localhost`) is rejected
 * because every derived hostname would be a bare label, and protocols, ports, paths and wildcards
 * are rejected because they cannot appear in an ingress host or a Caddy site address.
 */
export function isPublicDomain(value: string): boolean {
  if (value.length === 0 || value.length > 253) return false;
  const labels = value.split('.');
  return labels.length >= 2 && labels.every((label) => label.length <= 63 && dnsLabelPattern.test(label));
}

export const defaultProductConfig = {
  ciMode: 'product',
  frontendApiMode: 'same-origin',
  mobileTargets: ['web'],
} as const;

export const defaultDeploymentConfig = {
  targets: ['docker'],
  publicDomain: 'example.com',
  /**
   * The app that owns the apex. Nothing about the apex is special to the landing page — a product
   * whose marketing site is the front door sets this to `site-app` and every other app moves to a
   * subdomain without touching a template, a chart, or a Compose file.
   */
  primaryApp: 'landing-app',
  publicTopology: 'single-domain',
  kubernetesDelivery: 'direct',
  infrastructure: {
    redis: 'bundled',
    nats: 'bundled',
    s3: 'bundled',
  },
} as const;

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
    /**
     * Thresholds for `nrb git:conventions`. Held open rather than mirrored: the gate's own
     * `resolveGitConventionsConfig` already validates this object key by key and reports which
     * threshold is wrong, so restating the shape here would only give the two definitions a chance
     * to drift. Setup neither reads nor writes it — it is passed through so a product can retune
     * the gate without the strict schema above rejecting its own config file.
     */
    gitConventions: z.record(z.string(), z.unknown()).optional(),
    product: z
      .object({
        ciMode: z.enum(ciModeIds).default(defaultProductConfig.ciMode),
        frontendApiMode: z.enum(frontendApiModeIds).default(defaultProductConfig.frontendApiMode),
        mobileTargets: z.array(z.enum(mobileTargetIds)).default([...defaultProductConfig.mobileTargets]),
      })
      .strict()
      .default({ ...defaultProductConfig, mobileTargets: [...defaultProductConfig.mobileTargets] }),
    deployment: z
      .object({
        targets: z
          .array(z.enum(deploymentTargetIds))
          .min(1)
          .default([...defaultDeploymentConfig.targets]),
        publicDomain: z
          .string()
          .refine(isPublicDomain, {
            message: 'publicDomain must be a DNS base name without a protocol, port, path, or wildcard',
          })
          .default(defaultDeploymentConfig.publicDomain),
        primaryApp: z.enum(frontendAppIds).nullable().default(defaultDeploymentConfig.primaryApp),
        publicTopology: z.enum(publicTopologyIds).default(defaultDeploymentConfig.publicTopology),
        kubernetesDelivery: z.enum(kubernetesDeliveryIds).default(defaultDeploymentConfig.kubernetesDelivery),
        infrastructure: z
          .object({
            redis: z.enum(infrastructureOwnershipIds).default(defaultDeploymentConfig.infrastructure.redis),
            nats: z.enum(infrastructureOwnershipIds).default(defaultDeploymentConfig.infrastructure.nats),
            s3: z.enum(infrastructureOwnershipIds).default(defaultDeploymentConfig.infrastructure.s3),
          })
          .strict()
          .default({ ...defaultDeploymentConfig.infrastructure }),
      })
      .strict()
      .default({
        ...defaultDeploymentConfig,
        targets: [...defaultDeploymentConfig.targets],
        infrastructure: { ...defaultDeploymentConfig.infrastructure },
      }),
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
