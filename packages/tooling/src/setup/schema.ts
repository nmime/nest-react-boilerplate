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

import { capabilityIds as knownCapabilityIds, type BaseCapabilityId } from './capability-registry.ts';

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

/**
 * Cross-cutting capabilities that can be toggled.
 *
 * `baseCapabilityIds` is what this boilerplate ships and stays closed; `capabilityIds` also holds
 * whatever `product-capabilities.ts` registers. `string & {}` keeps editor completion for the
 * shipped ids while still accepting a product's own, which is what makes the axis extensible
 * without a fork.
 */
export * from './capability-registry.ts';
export type CapabilityId = BaseCapabilityId | (string & {});

/** The selection shipped by a fresh checkout before any product reconfiguration. */
export const defaultTemplateApps = [
  'admin-app',
  'admin-app-api',
  'auth-app-api',
  'fullstack-e2e',
  'landing-app',
  'mobile-app',
  'notification-consumer',
  'notification-scheduler',
  'site-app',
  'user-app',
  'user-app-api',
] as const satisfies readonly AppId[];

/** The capabilities shipped by a fresh checkout before any product reconfiguration. */
export const defaultTemplateCapabilities = [
  'authz',
  'design-tokens',
  'feature-flags',
  'i18n',
  'notifications',
  'postgres',
  's3',
] as const satisfies readonly CapabilityId[];

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
  if (value.length === 0 || value.length > 253) {
    return false;
  }
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
  imageRegistry: 'ghcr.io/your-github-org/nest-react-boilerplate',
} as const;

/** Supported preset names — deterministic, expandable to apps + capabilities. */
export const presetIds = ['minimal', 'web', 'fullstack', 'enterprise', 'bots'] as const;
export type PresetId = (typeof presetIds)[number];

// ---------------------------------------------------------------------------
// Identity / brand / runtime / session / tenant defaults
// ---------------------------------------------------------------------------

export const defaultIdentityBrandConfig = {
  cliBin: 'nrb',
  stateDir: '.nrb',
  envPrefix: 'NRB',
  imagePrefix: 'nrb',
  imageTag: 'local',
  redisKeyPrefix: 'nrb:',
  helmChart: 'nest-react-boilerplate',
  helmRelease: 'nest-react-boilerplate',
  natsClientName: 'nest-react-boilerplate-local',
  s3Bucket: 'nest-react-boilerplate',
} as const;

export const defaultIdentityConfig = {
  name: 'Nest React Boilerplate',
  slug: 'nest-react-boilerplate',
  packageName: 'nest-react-boilerplate',
  dbName: 'nest_react_boilerplate',
  className: 'NestReactBoilerplate',
  owner: 'your-github-org',
  domain: 'example.com',
  apexApp: 'landing-app',
  aliasPrefix: '@app',
  toolingScope: '@repo',
  brand: { ...defaultIdentityBrandConfig },
} as const;

export const defaultRuntimePorts = {
  'admin-app-api': 3001,
  'user-app-api': 3002,
  'auth-app-api': 3003,
  'discord-app-api': 3007,
  'telegram-bot-api': 3013,
  'admin-app': 4200,
  'user-app': 4201,
  'landing-app': 4202,
  'site-app': 4203,
  'mobile-app': 4300,
  postgres: 5432,
  redis: 6379,
  mongodb: 27017,
  nats: 4222,
  'nats-monitor': 8222,
  minio: 9000,
  'minio-console': 9001,
  'otlp-grpc': 4317,
  'otlp-http': 4318,
  edge: 8080,
  grafana: 3000,
  prometheus: 9090,
  loki: 3100,
  tempo: 3200,
} as const;

export const defaultRuntimeConfig = {
  ports: { ...defaultRuntimePorts },
  stagingOffset: 100,
  containerPort: 80,
  postgres: { user: 'postgres', password: 'postgres' },
  minio: { accessKey: 'minioadmin', secretKey: 'minioadmin' },
  localSecrets: {
    session: 'local-session-secret-change-me-32-chars',
    betterAuth: 'local-better-auth-secret-change-me-32-chars',
    discordCustomId: 'local-discord-custom-id-secret',
  },
} as const;

export const defaultSessionConfig = {
  cookieNameDev: 'nrb.sid',
  cookieNameProd: '__Host-nrb.sid',
  maxAgeSeconds: 604800,
  sameSite: 'lax',
  secure: true,
} as const;

export const defaultTenantSeedAdmin = {
  name: 'Alice Administrator',
  email: 'admin@example.com',
  password: 'ChangeMe123!',
} as const;

export const defaultTenantSeedUsers = [
  { name: 'Bob User', email: 'bob.user@example.com', password: 'Bob@User456!' },
  { name: 'Charlie Dev', email: 'charlie.dev@example.com', password: 'Charlie@Dev789!' },
] as const;

export const defaultTenantConfig = {
  defaultTenantId: '00000000-0000-0000-0000-000000000000',
  seed: {
    admin: { ...defaultTenantSeedAdmin },
    users: [...defaultTenantSeedUsers],
  },
} as const;

export const defaultImageRegistry = 'ghcr.io/your-github-org/nest-react-boilerplate' as const;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const packageNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const dbNamePattern = /^[a-z0-9_]+$/u;
const classNamePattern = /^[A-Z][a-zA-Z0-9]*$/u;
const aliasPrefixPattern = /^@[a-z]+$/u;
const toolingScopePattern = /^@[a-z]+$/u;
const cliBinPattern = /^[a-z0-9-]+$/u;
const stateDirPattern = /^\.[a-z0-9-]+$/u;
const envPrefixPattern = /^[A-Z][A-Z0-9_]*$/u;
const imagePrefixPattern = /^[a-z0-9-]+$/u;
const imageTagPattern = /^[a-z0-9._-]+$/u;
const ownerPattern = /^[a-z0-9-]+$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

// ---------------------------------------------------------------------------
// Schema versioning
// ---------------------------------------------------------------------------

export const schemaVersion = '2.0.0' as const;
export const legacySchemaVersion = '1.0.0' as const;

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

const brandSchema = z
  .object({
    cliBin: z
      .string()
      .regex(cliBinPattern, 'cliBin must be lower-case alphanumeric with hyphens')
      .default(defaultIdentityBrandConfig.cliBin),
    stateDir: z
      .string()
      .regex(stateDirPattern, 'stateDir must start with a dot')
      .default(defaultIdentityBrandConfig.stateDir),
    envPrefix: z
      .string()
      .regex(envPrefixPattern, 'envPrefix must be upper-case alphanumeric with underscores')
      .default(defaultIdentityBrandConfig.envPrefix),
    imagePrefix: z
      .string()
      .regex(imagePrefixPattern, 'imagePrefix must be lower-case alphanumeric with hyphens')
      .default(defaultIdentityBrandConfig.imagePrefix),
    imageTag: z
      .string()
      .regex(imageTagPattern, 'imageTag must be a valid Docker tag')
      .default(defaultIdentityBrandConfig.imageTag),
    redisKeyPrefix: z.string().min(1).default(defaultIdentityBrandConfig.redisKeyPrefix),
    helmChart: z
      .string()
      .regex(packageNamePattern, 'helmChart must be a valid chart name')
      .default(defaultIdentityBrandConfig.helmChart),
    helmRelease: z
      .string()
      .regex(packageNamePattern, 'helmRelease must be a valid release name')
      .default(defaultIdentityBrandConfig.helmRelease),
    natsClientName: z.string().min(1).default(defaultIdentityBrandConfig.natsClientName),
    s3Bucket: z
      .string()
      .regex(packageNamePattern, 's3Bucket must be a valid bucket name')
      .default(defaultIdentityBrandConfig.s3Bucket),
  })
  .strict()
  .default({ ...defaultIdentityBrandConfig });

const identitySchema = z
  .object({
    name: z.string().min(1).default(defaultIdentityConfig.name),
    slug: z.string().regex(slugPattern, 'slug must be lower-case kebab-case').default(defaultIdentityConfig.slug),
    packageName: z
      .string()
      .regex(packageNamePattern, 'packageName must be lower-case kebab-case')
      .default(defaultIdentityConfig.packageName),
    dbName: z
      .string()
      .regex(dbNamePattern, 'dbName must be lower-case with underscores')
      .default(defaultIdentityConfig.dbName),
    className: z
      .string()
      .regex(classNamePattern, 'className must be PascalCase')
      .default(defaultIdentityConfig.className),
    owner: z
      .string()
      .regex(ownerPattern, 'owner must be lower-case alphanumeric with hyphens')
      .default(defaultIdentityConfig.owner),
    domain: z
      .string()
      .refine(isPublicDomain, {
        message: 'domain must be a DNS base name without a protocol, port, path, or wildcard',
      })
      .default(defaultIdentityConfig.domain),
    apexApp: z
      .enum(frontendAppIds)
      .nullable()
      .default(defaultIdentityConfig.apexApp as FrontendAppId),
    aliasPrefix: z
      .string()
      .regex(aliasPrefixPattern, 'aliasPrefix must be @ followed by lower-case letters')
      .default(defaultIdentityConfig.aliasPrefix),
    toolingScope: z
      .string()
      .regex(toolingScopePattern, 'toolingScope must be @ followed by lower-case letters')
      .default(defaultIdentityConfig.toolingScope),
    brand: brandSchema,
  })
  .strict()
  .default({
    ...defaultIdentityConfig,
    brand: { ...defaultIdentityBrandConfig },
  });

const appRenamesSchema = z
  .record(z.string(), z.string())
  .default({})
  .superRefine((value, ctx) => {
    for (const [from, to] of Object.entries(value)) {
      if (!(appIds as readonly string[]).includes(from)) {
        ctx.addIssue({
          code: 'custom',
          message: `Unknown app ID in appRenames: ${from}. Known IDs: ${[...appIds].join(', ')}`,
        });
      }
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(to)) {
        ctx.addIssue({
          code: 'custom',
          message: `appRenames value for ${from} must be a valid Nx project name (lower-case kebab-case): ${to}`,
        });
      }
    }
  });

const runtimePortNames = Object.keys(defaultRuntimePorts) as Array<keyof typeof defaultRuntimePorts>;
const runtimePortsSchema = z
  .record(z.string(), z.number().int().min(1).max(65535))
  .default({})
  .superRefine((value, ctx) => {
    for (const name of Object.keys(value)) {
      if (!runtimePortNames.includes(name as keyof typeof defaultRuntimePorts)) {
        ctx.addIssue({ code: 'custom', message: `Unknown runtime port: ${name}` });
      }
    }
  })
  .transform((value) => ({ ...defaultRuntimePorts, ...value }));

const runtimeSchema = z
  .object({
    ports: runtimePortsSchema,
    stagingOffset: z.number().int().min(0).max(10000).default(defaultRuntimeConfig.stagingOffset),
    containerPort: z.number().int().min(1).max(65535).default(defaultRuntimeConfig.containerPort),
    postgres: z
      .object({
        user: z.string().min(1).default(defaultRuntimeConfig.postgres.user),
        password: z.string().min(1).default(defaultRuntimeConfig.postgres.password),
      })
      .strict()
      .default({ ...defaultRuntimeConfig.postgres }),
    minio: z
      .object({
        accessKey: z.string().min(1).default(defaultRuntimeConfig.minio.accessKey),
        secretKey: z.string().min(1).default(defaultRuntimeConfig.minio.secretKey),
      })
      .strict()
      .default({ ...defaultRuntimeConfig.minio }),
    localSecrets: z
      .object({
        session: z.string().min(1).default(defaultRuntimeConfig.localSecrets.session),
        betterAuth: z.string().min(1).default(defaultRuntimeConfig.localSecrets.betterAuth),
        discordCustomId: z.string().min(1).default(defaultRuntimeConfig.localSecrets.discordCustomId),
      })
      .strict()
      .default({ ...defaultRuntimeConfig.localSecrets }),
  })
  .strict()
  .default({
    ports: { ...defaultRuntimePorts },
    stagingOffset: defaultRuntimeConfig.stagingOffset,
    containerPort: defaultRuntimeConfig.containerPort,
    postgres: { ...defaultRuntimeConfig.postgres },
    minio: { ...defaultRuntimeConfig.minio },
    localSecrets: { ...defaultRuntimeConfig.localSecrets },
  });

const sessionSchema = z
  .object({
    cookieNameDev: z.string().min(1).default(defaultSessionConfig.cookieNameDev),
    cookieNameProd: z.string().min(1).default(defaultSessionConfig.cookieNameProd),
    maxAgeSeconds: z.number().int().min(1).default(defaultSessionConfig.maxAgeSeconds),
    sameSite: z.enum(['lax', 'strict', 'none']).default(defaultSessionConfig.sameSite as 'lax'),
    secure: z.boolean().default(defaultSessionConfig.secure),
  })
  .strict()
  .default({ ...defaultSessionConfig });

const tenantSeedUserSchema = z
  .object({
    name: z.string().min(1),
    email: z.string().regex(emailPattern, 'must be a valid email'),
    password: z.string().min(1),
  })
  .strict();

const tenantSchema = z
  .object({
    defaultTenantId: z
      .string()
      .regex(uuidPattern, 'defaultTenantId must be a valid UUID')
      .default(defaultTenantConfig.defaultTenantId),
    seed: z
      .object({
        admin: tenantSeedUserSchema.default({ ...defaultTenantSeedAdmin }),
        users: z.array(tenantSeedUserSchema).default([...defaultTenantSeedUsers]),
      })
      .strict()
      .default({
        admin: { ...defaultTenantSeedAdmin },
        users: [...defaultTenantSeedUsers],
      }),
  })
  .strict()
  .default({
    defaultTenantId: defaultTenantConfig.defaultTenantId,
    seed: {
      admin: { ...defaultTenantSeedAdmin },
      users: [...defaultTenantSeedUsers],
    },
  });

// ---------------------------------------------------------------------------
// Root schema factory
// ---------------------------------------------------------------------------

/**
 * The root configuration schema, over a given capability id set.
 *
 * - `schemaVersion` MUST equal the current major version string.
 * - `preset` is an optional exact shortcut; the CLI materializes it into a
 *   custom selection before additive/removal updates.
 * - `apps` is a flat string[] restricted to known IDs.
 * - `capabilities` is a flat string[] restricted to the ids passed in.
 * - `options` holds boolean toggles for generation behaviour.
 * - Passthrough is NOT used — unknown keys are rejected with a clear error.
 *
 * The capability set is a parameter rather than a closed enum because a product registers its own
 * ids; `NrbConfigSchema` below binds it to what this checkout actually knows.
 */
export function createNrbConfigSchema(capabilityIdSet: readonly string[]) {
  const known = new Set(capabilityIdSet);
  return z
    .object({
      schemaVersion: z.literal(schemaVersion),
      preset: z.enum(presetIds).optional(),
      apps: z.array(z.enum(appIds)).default([]),
      capabilities: z
        .array(
          z.string().superRefine((value, ctx) => {
            if (!known.has(value)) {
              ctx.addIssue({
                code: 'custom',
                message: `Unknown capability ID: ${value}. Known IDs: ${[...known].join(', ')}`,
              });
            }
          }),
        )
        .default([]),
      /**
       * Thresholds for `nrb git:conventions`. Held open rather than mirrored: the gate's own
       * `resolveGitConventionsConfig` already validates this object key by key and reports which
       * threshold is wrong, so restating the shape here would only give the two definitions a chance
       * to drift. Setup neither reads nor writes it — it is passed through so a product can retune
       * the gate without the strict schema above rejecting its own config file.
       */
      gitConventions: z.record(z.string(), z.unknown()).optional(),
      identity: identitySchema,
      appRenames: appRenamesSchema,
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
          imageRegistry: z.string().min(1).default(defaultImageRegistry),
        })
        .strict()
        .default({
          ...defaultDeploymentConfig,
          targets: [...defaultDeploymentConfig.targets],
          infrastructure: { ...defaultDeploymentConfig.infrastructure },
          imageRegistry: defaultImageRegistry,
        }),
      runtime: runtimeSchema,
      session: sessionSchema,
      tenant: tenantSchema,
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
    .strict()
    .superRefine((value, ctx) => {
      if (value.identity.domain !== value.deployment.publicDomain) {
        ctx.addIssue({
          code: 'custom',
          path: ['deployment', 'publicDomain'],
          message: `deployment.publicDomain (${value.deployment.publicDomain}) must equal identity.domain (${value.identity.domain})`,
        });
      }
      const renameTargets = new Map<string, string>();
      for (const [source, target] of Object.entries(value.appRenames)) {
        const prior = renameTargets.get(target);
        if (prior && prior !== source) {
          ctx.addIssue({
            code: 'custom',
            path: ['appRenames', source],
            message: `appRenames target ${target} is already used by ${prior}`,
          });
        }
        renameTargets.set(target, source);
        if (target !== source && (appIds as readonly string[]).includes(target) && !(target in value.appRenames)) {
          ctx.addIssue({
            code: 'custom',
            path: ['appRenames', source],
            message: `appRenames target ${target} collides with an existing project name`,
          });
        }
      }
      const usedPorts = new Map<number, string>();
      for (const name of runtimePortNames) {
        const port = value.runtime.ports[name];
        const prior = usedPorts.get(port);
        if (prior) {
          ctx.addIssue({
            code: 'custom',
            path: ['runtime', 'ports', name],
            message: `runtime port ${port} is already assigned to ${prior}`,
          });
        }
        usedPorts.set(port, name);
        const stagingPort = port + value.runtime.stagingOffset;
        if (stagingPort > 65535) {
          ctx.addIssue({
            code: 'custom',
            path: ['runtime', 'stagingOffset'],
            message: `staging port for ${name} exceeds 65535`,
          });
        }
      }
      if (value.session.sameSite === 'none' && !value.session.secure) {
        ctx.addIssue({
          code: 'custom',
          path: ['session', 'secure'],
          message: 'session.secure must be true when sameSite is none',
        });
      }
      const seedEmails = [value.tenant.seed.admin.email, ...value.tenant.seed.users.map(({ email }) => email)];
      if (new Set(seedEmails.map((email) => email.toLowerCase())).size !== seedEmails.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['tenant', 'seed'],
          message: 'tenant seed email addresses must be unique',
        });
      }
    });
}

/** The schema bound to the capability ids this checkout knows: shipped plus product-registered. */
export const NrbConfigSchema = createNrbConfigSchema(knownCapabilityIds);

export type NrbConfig = z.infer<typeof NrbConfigSchema>;

// ---------------------------------------------------------------------------
// Migration — 1.0.0 -> 2.0.0
// ---------------------------------------------------------------------------

/**
 * Migrate a raw 1.0.0 config object to 2.0.0 by filling identity/brand/appRenames/runtime/session/tenant defaults.
 *
 * The caller has already validated that schemaVersion is "1.0.0".  This function
 * returns a new object with schemaVersion "2.0.0" and all new namespaces populated
 * from their defaults.  If the input already has any of the new keys (forward-compat),
 * those values are preserved.
 */
export function migrateV1ToV2(raw: Record<string, unknown>): Record<string, unknown> {
  const migrated: Record<string, unknown> = { ...raw, schemaVersion };

  if (!('identity' in migrated) || migrated.identity === undefined) {
    migrated.identity = {
      ...defaultIdentityConfig,
      brand: { ...defaultIdentityBrandConfig },
    };
  }
  if (!('appRenames' in migrated) || migrated.appRenames === undefined) {
    migrated.appRenames = {};
  }
  if (!('runtime' in migrated) || migrated.runtime === undefined) {
    migrated.runtime = {
      ports: { ...defaultRuntimePorts },
      stagingOffset: defaultRuntimeConfig.stagingOffset,
      containerPort: defaultRuntimeConfig.containerPort,
      postgres: { ...defaultRuntimeConfig.postgres },
      minio: { ...defaultRuntimeConfig.minio },
      localSecrets: { ...defaultRuntimeConfig.localSecrets },
    };
  }
  if (!('session' in migrated) || migrated.session === undefined) {
    migrated.session = { ...defaultSessionConfig };
  }
  if (!('tenant' in migrated) || migrated.tenant === undefined) {
    migrated.tenant = {
      defaultTenantId: defaultTenantConfig.defaultTenantId,
      seed: {
        admin: { ...defaultTenantSeedAdmin },
        users: [...defaultTenantSeedUsers],
      },
    };
  }

  // Ensure deployment.imageRegistry is present (new in v2)
  if (migrated.deployment !== null && typeof migrated.deployment === 'object' && !Array.isArray(migrated.deployment)) {
    const dep = migrated.deployment as Record<string, unknown>;
    if (!('imageRegistry' in dep) || dep.imageRegistry === undefined) {
      migrated.deployment = { ...dep, imageRegistry: defaultImageRegistry };
    }
  }

  return migrated;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

function syncIdentityDomain(raw: Record<string, unknown>): Record<string, unknown> {
  const identity = raw.identity as Record<string, unknown> | undefined;
  const deployment = raw.deployment as Record<string, unknown> | undefined;
  const identityDomain = identity?.domain as string | undefined;
  const publicDomain = deployment?.publicDomain as string | undefined;

  // If only one side is explicitly set, sync the other so the cross-field rule holds.
  // This keeps existing callers that only set deployment.publicDomain working.
  if (identityDomain !== undefined && publicDomain === undefined) {
    const nextDeployment = { ...(deployment ?? {}), publicDomain: identityDomain };
    return { ...raw, deployment: nextDeployment };
  }
  if (publicDomain !== undefined && identityDomain === undefined) {
    const nextIdentity = { ...(identity ?? {}), domain: publicDomain };
    return { ...raw, identity: nextIdentity };
  }
  return raw;
}

/**
 * Parse raw input into a validated `NrbConfig`.
 *
 * Accepts both 1.0.0 (migrated) and 2.0.0 inputs.  A 1.0.0 config is
 * automatically migrated to 2.0.0 by filling defaults for all new namespaces.
 *
 * @throws {z.ZodError} when the input shape or values are invalid.
 */
export function parseNrbConfig(raw: unknown): NrbConfig {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if (obj.schemaVersion === legacySchemaVersion) {
      return NrbConfigSchema.parse(migrateV1ToV2(syncIdentityDomain(obj)));
    }
    const synced = syncIdentityDomain(obj);
    return NrbConfigSchema.parse(synced);
  }
  return NrbConfigSchema.parse(raw);
}

/**
 * Safely parse; returns `{ success, data }` or `{ success, error }`.
 *
 * Accepts both 1.0.0 (migrated) and 2.0.0 inputs.
 */
export function safeParseNrbConfig(
  raw: unknown,
): { success: true; data: NrbConfig } | { success: false; error: z.ZodError } {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if (obj.schemaVersion === legacySchemaVersion) {
      const migrated = migrateV1ToV2(syncIdentityDomain(obj));
      const result = NrbConfigSchema.safeParse(migrated);
      if (result.success) {
        return { success: true, data: result.data };
      }
      return { success: false, error: result.error };
    }
    const synced = syncIdentityDomain(obj);
    const result = NrbConfigSchema.safeParse(synced);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
  }
  const result = NrbConfigSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
