// Evidence for: REQ-SCAFFOLD-SELECTION-002
/**
 * Static setup-catalog evidence for REQ-SCAFFOLD-SELECTION-002.
 *
 * Catalog of applications, capabilities, and their dependency / conflict
 * rules.  Pure data — no side-effects, no filesystem access.
 */
import type { AppId, CapabilityId, FrontendAppId } from './schema.js';

// ---------------------------------------------------------------------------
// App metadata
// ---------------------------------------------------------------------------

export interface AppEntry {
  /** Stable identifier matching project.json `name`. */
  id: AppId;
  /** Short human-readable label. */
  label: string;
  /** Platform layer this app belongs to. */
  platform: 'frontend' | 'backend' | 'e2e';
  /** Whether this is a reference product surface or an optional integration. */
  classification: 'reference' | 'optional';
  /** Human-facing runtime summary used by setup and generated reference docs. */
  runtime: string;
  /**
   * Whether this project is served on a public hostname. The hostname itself is not stored here:
   * it is derived from the configured domain and apex owner by `appPublicHostname`, so a product
   * changes its public addressing in one place instead of editing this catalog.
   */
  deployable: boolean;
  /** Capabilities that this app REQUIRES when present. */
  requiresCapabilities: CapabilityId[];
  /** Other apps that must be present when this app is enabled. */
  requiresApps: AppId[];
  /** Capabilities that conflict with this app. */
  conflictsWithCapabilities: CapabilityId[];
  /** Whether this app needs one durable database provider. */
  requiresDurableDatabase?: boolean;
  /** Immutable image metadata for release/Bake planning. Omit for non-image projects. */
  releaseImage?: ReleaseImageEntry;
}

export interface ReleaseImageEntry {
  target: 'backend' | 'frontend' | 'site-runtime';
  /** Values key used by the application Helm chart. */
  helmValuesKey: string;
  /** Production Compose container port; omit for background-only images. */
  composePort?: number;
  buildOutput?: string;
  frontendOutput?: string;
  nxTarget?: string;
}

/**
 * Full catalog of supported applications, derived from the actual repo.
 *
 * Indexed by app ID for O(1) lookup.
 */
export const appCatalog: Readonly<Record<AppId, Readonly<AppEntry>>> = {
  /* --- Frontend apps --- */
  'admin-app': {
    id: 'admin-app',
    label: 'Admin Dashboard',
    platform: 'frontend',
    classification: 'reference',
    runtime: 'React + Vite SPA',
    deployable: true,
    requiresCapabilities: ['authz'],
    requiresApps: ['admin-app-api', 'auth-app-api'],
    conflictsWithCapabilities: [],
    releaseImage: {
      target: 'frontend',
      helmValuesKey: 'adminApp',
      composePort: 8080,
      frontendOutput: 'dist/apps/frontend/admin',
    },
  },
  'user-app': {
    id: 'user-app',
    label: 'User Application',
    platform: 'frontend',
    classification: 'reference',
    runtime: 'React + Vite SPA',
    deployable: true,
    requiresCapabilities: ['i18n'],
    requiresApps: ['user-app-api', 'auth-app-api'],
    conflictsWithCapabilities: [],
    releaseImage: {
      target: 'frontend',
      helmValuesKey: 'userApp',
      composePort: 8080,
      frontendOutput: 'dist/apps/frontend/app',
    },
  },
  'landing-app': {
    id: 'landing-app',
    label: 'Landing Page',
    platform: 'frontend',
    classification: 'reference',
    runtime: 'Astro + React islands',
    deployable: true,
    requiresCapabilities: [],
    requiresApps: [],
    conflictsWithCapabilities: [],
    releaseImage: {
      target: 'frontend',
      helmValuesKey: 'landingApp',
      composePort: 8080,
      frontendOutput: 'dist/apps/frontend/landing',
    },
  },
  'site-app': {
    id: 'site-app',
    label: 'Marketing Site',
    platform: 'frontend',
    classification: 'reference',
    runtime: 'Vike + React SSR',
    deployable: true,
    requiresCapabilities: [],
    requiresApps: [],
    conflictsWithCapabilities: [],
    releaseImage: {
      target: 'site-runtime',
      helmValuesKey: 'siteApp',
      composePort: 80,
    },
  },
  'mobile-app': {
    id: 'mobile-app',
    label: 'Mobile App',
    platform: 'frontend',
    classification: 'reference',
    runtime: 'Expo + React Native',
    deployable: true,
    requiresCapabilities: ['design-tokens'],
    requiresApps: ['auth-app-api', 'user-app-api'],
    conflictsWithCapabilities: [],
    releaseImage: {
      target: 'frontend',
      helmValuesKey: 'mobileApp',
      composePort: 8080,
      frontendOutput: 'dist/apps/frontend/mobile',
      nxTarget: 'export',
    },
  },

  /* --- Backend apps --- */
  'admin-app-api': {
    id: 'admin-app-api',
    label: 'Admin API',
    platform: 'backend',
    classification: 'reference',
    runtime: 'NestJS + Fastify API',
    deployable: true,
    requiresCapabilities: ['authz', 'feature-flags', 'notifications'],
    requiresApps: [],
    conflictsWithCapabilities: [],
    requiresDurableDatabase: true,
    releaseImage: {
      target: 'backend',
      helmValuesKey: 'adminAppApi',
      composePort: 80,
      buildOutput: 'dist/apps/backend/admin/admin-app-api',
    },
  },
  'user-app-api': {
    id: 'user-app-api',
    label: 'User API',
    platform: 'backend',
    classification: 'reference',
    runtime: 'NestJS + Fastify API',
    deployable: true,
    requiresCapabilities: [],
    requiresApps: [],
    conflictsWithCapabilities: [],
    requiresDurableDatabase: true,
    releaseImage: {
      target: 'backend',
      helmValuesKey: 'userAppApi',
      composePort: 80,
      buildOutput: 'dist/apps/backend/user/user-app-api',
    },
  },
  'auth-app-api': {
    id: 'auth-app-api',
    label: 'Auth API',
    platform: 'backend',
    classification: 'reference',
    runtime: 'NestJS + Fastify API',
    deployable: true,
    requiresCapabilities: [],
    requiresApps: [],
    conflictsWithCapabilities: [],
    requiresDurableDatabase: true,
    releaseImage: {
      target: 'backend',
      helmValuesKey: 'authAppApi',
      composePort: 80,
      buildOutput: 'dist/apps/backend/auth/auth-app-api',
    },
  },
  'discord-app-api': {
    id: 'discord-app-api',
    label: 'Discord Bot API',
    platform: 'backend',
    classification: 'optional',
    runtime: 'NestJS + Fastify integration API',
    deployable: true,
    requiresCapabilities: ['discord-bot', 'redis'],
    requiresApps: [],
    conflictsWithCapabilities: [],
    requiresDurableDatabase: true,
    releaseImage: {
      target: 'backend',
      helmValuesKey: 'discordAppApi',
      composePort: 80,
      buildOutput: 'dist/apps/backend/discord/discord-app-api',
    },
  },
  'telegram-bot-api': {
    id: 'telegram-bot-api',
    label: 'Telegram Bot API',
    platform: 'backend',
    classification: 'optional',
    runtime: 'NestJS + Fastify bot API',
    deployable: true,
    requiresCapabilities: ['redis', 'telegram-bot'],
    requiresApps: [],
    conflictsWithCapabilities: [],
    requiresDurableDatabase: true,
    releaseImage: {
      target: 'backend',
      helmValuesKey: 'telegramBotApi',
      composePort: 80,
      buildOutput: 'dist/apps/backend/telegram/telegram-bot-api',
    },
  },
  'notification-scheduler': {
    id: 'notification-scheduler',
    label: 'Notification Scheduler',
    platform: 'backend',
    classification: 'optional',
    runtime: 'NestJS scheduled-job process',
    deployable: false,
    requiresCapabilities: ['notifications'],
    requiresApps: [],
    conflictsWithCapabilities: [],
    requiresDurableDatabase: true,
    releaseImage: {
      target: 'backend',
      helmValuesKey: 'notificationScheduler',
      buildOutput: 'dist/apps/backend/notification/notification-scheduler',
    },
  },
  'notification-consumer': {
    id: 'notification-consumer',
    label: 'Notification Consumer',
    platform: 'backend',
    classification: 'optional',
    runtime: 'NestJS background consumer process',
    deployable: false,
    requiresCapabilities: ['notifications', 's3'],
    requiresApps: [],
    conflictsWithCapabilities: [],
    requiresDurableDatabase: true,
    releaseImage: {
      target: 'backend',
      helmValuesKey: 'notificationConsumer',
      buildOutput: 'dist/apps/backend/notification/notification-consumer',
    },
  },
  /* --- E2E --- */
  'fullstack-e2e': {
    id: 'fullstack-e2e',
    label: 'Fullstack E2E Tests',
    platform: 'e2e',
    classification: 'reference',
    runtime: 'Playwright full-stack tests',
    deployable: false,
    requiresCapabilities: [],
    requiresApps: ['admin-app', 'admin-app-api', 'auth-app-api', 'landing-app', 'site-app', 'user-app', 'user-app-api'],
    conflictsWithCapabilities: [],
  },
  'acceptance-e2e': {
    id: 'acceptance-e2e',
    label: 'Executable Acceptance Specifications',
    platform: 'e2e',
    classification: 'reference',
    runtime: 'Cucumber.js domain and API acceptance tests',
    deployable: false,
    requiresCapabilities: [],
    requiresApps: [],
    conflictsWithCapabilities: [],
  },
} as const;

/** How a deployment addresses its public surface. */
export interface PublicDomainConfig {
  /** DNS base name the deployment is reachable under, e.g. `dehqonhub.uz`. */
  publicDomain: string;
  /** Frontend app served on the apex, or null to keep every app on its own subdomain. */
  primaryApp: FrontendAppId | null;
}

/**
 * The single derivation every deploy path agrees on: the apex owner gets the bare domain, every
 * other deployable app gets `{app-id}.{domain}`, and non-deployable projects get nothing.
 *
 * Takes the entry rather than the ID so callers holding a catalog that is not `appCatalog` — the
 * documentation generator scanning a fixture, for one — get the same rule instead of reimplementing
 * it. `appPublicHostname` is the by-ID convenience over the same function.
 */
export function publicHostnameFor(
  entry: Pick<AppEntry, 'id' | 'deployable'> | undefined,
  config: PublicDomainConfig,
): string | null {
  if (!entry?.deployable) return null;
  return entry.id === config.primaryApp ? config.publicDomain : `${entry.id}.${config.publicDomain}`;
}

export function appPublicHostname(appId: AppId, config: PublicDomainConfig): string | null {
  return publicHostnameFor(appCatalog[appId], config);
}

// ---------------------------------------------------------------------------
// Capability metadata
// ---------------------------------------------------------------------------

export interface CapabilityEntry {
  id: CapabilityId;
  label: string;
  activation: 'nest-module' | 'bootstrap' | 'source-library' | 'infrastructure' | 'application';
  requiresCapabilities: CapabilityId[];
  requiresApps: AppId[];
  conflictsWith: CapabilityId[];
  requiresDurableDatabase?: boolean;
  ownedProjects: string[];
  providerOwnedProjects?: Partial<Record<DurableDatabaseProviderId, string[]>>;
  telemetryWiring?: BackendTelemetryWiring;
  providerTelemetryInstrumentation?: BackendModuleImport;
  dockerServices: string[];
  environmentVariables: string[];
  backendWiring: BackendModuleWiring[];
  providerBackendWiring?: Partial<Record<DurableDatabaseProviderId, BackendModuleWiring[]>>;
  /**
   * Migration classes that exist only while this capability is selected.
   *
   * Everything else a capability owns is inert when deselected — an unimported
   * module changes nothing. A migration is not: it is DDL that runs against the
   * customer's database whether or not the feature is wired, which is how the
   * tenant row-level-security policies came to ship enabled for single-tenant
   * projects that had no way to satisfy them. Listing them here keeps them out
   * of the base migration set until the capability is chosen.
   */
  providerMigrations?: Partial<Record<DurableDatabaseProviderId, CapabilityMigration[]>>;
}

/** One capability-owned migration class, addressed the way the registry imports it. */
export interface CapabilityMigration {
  importName: string;
  importPath: string;
}

export type DurableDatabaseProviderId = 'postgres' | 'mongodb';

export interface BackendModuleWiring {
  hosts: 'selected-backend' | AppId[];
  importName: string;
  importPath: string;
  moduleExpression: string;
  additionalImports?: BackendModuleImport[];
}

export interface BackendModuleImport {
  importName: string;
  importPath: string;
}

export interface BackendTelemetryWiring {
  hosts: 'selected-backend' | AppId[];
  initializer: BackendModuleImport;
  instrumentationFactory: BackendModuleImport;
}

export interface BackendCapabilityModuleEntry {
  path: string;
  bootstrapPath: string;
  className: string;
}

export const backendCapabilityModuleCatalog: Readonly<Partial<Record<AppId, Readonly<BackendCapabilityModuleEntry>>>> =
  {
    'admin-app-api': {
      path: 'apps/backend/admin/admin-app-api/src/capabilities.generated.ts',
      bootstrapPath: 'apps/backend/admin/admin-app-api/src/capabilities.bootstrap.generated.ts',
      className: 'AdminAppApiCapabilitiesModule',
    },
    'user-app-api': {
      path: 'apps/backend/user/user-app-api/src/capabilities.generated.ts',
      bootstrapPath: 'apps/backend/user/user-app-api/src/capabilities.bootstrap.generated.ts',
      className: 'UserAppApiCapabilitiesModule',
    },
    'auth-app-api': {
      path: 'apps/backend/auth/auth-app-api/src/capabilities.generated.ts',
      bootstrapPath: 'apps/backend/auth/auth-app-api/src/capabilities.bootstrap.generated.ts',
      className: 'AuthAppApiCapabilitiesModule',
    },
    'discord-app-api': {
      path: 'apps/backend/discord/discord-app-api/src/capabilities.generated.ts',
      bootstrapPath: 'apps/backend/discord/discord-app-api/src/capabilities.bootstrap.generated.ts',
      className: 'DiscordAppApiCapabilitiesModule',
    },
    'telegram-bot-api': {
      path: 'apps/backend/telegram/telegram-bot-api/src/capabilities.generated.ts',
      bootstrapPath: 'apps/backend/telegram/telegram-bot-api/src/capabilities.bootstrap.generated.ts',
      className: 'TelegramBotApiCapabilitiesModule',
    },
    'notification-scheduler': {
      path: 'apps/backend/notification/notification-scheduler/src/capabilities.generated.ts',
      bootstrapPath: 'apps/backend/notification/notification-scheduler/src/capabilities.bootstrap.generated.ts',
      className: 'NotificationSchedulerCapabilitiesModule',
    },
    'notification-consumer': {
      path: 'apps/backend/notification/notification-consumer/src/capabilities.generated.ts',
      bootstrapPath: 'apps/backend/notification/notification-consumer/src/capabilities.bootstrap.generated.ts',
      className: 'NotificationConsumerCapabilitiesModule',
    },
  } as const;

/**
 * Full catalog of supported capabilities.
 *
 * Indexed by capability ID for O(1) lookup.
 */
export const capabilityCatalog: Readonly<Record<CapabilityId, Readonly<CapabilityEntry>>> = {
  i18n: {
    id: 'i18n',
    label: 'Internationalization',
    activation: 'source-library',
    requiresCapabilities: [],
    requiresApps: [],
    conflictsWith: [],
    ownedProjects: [
      '@app/common-i18n-runtime',
      '@app/common-i18n-keys',
      '@app/backend-common-i18n',
      '@app/frontend-i18n-shared',
      '@app/frontend-feature-admin-i18n',
      '@app/frontend-feature-user-i18n',
      '@app/frontend-feature-landing-i18n',
    ],
    dockerServices: [],
    environmentVariables: ['APP_LOCALE', 'APP_FALLBACK_LOCALE'],
    backendWiring: [],
  },
  analytics: {
    id: 'analytics',
    label: 'Analytics Tracking',
    activation: 'nest-module',
    requiresCapabilities: [],
    requiresApps: [],
    conflictsWith: [],
    ownedProjects: ['@app/backend-common-analytics'],
    dockerServices: [],
    environmentVariables: ['ANALYTICS_ENABLED'],
    backendWiring: [
      {
        hosts: 'selected-backend',
        importName: 'AnalyticsModule',
        importPath: '@app/backend-common-analytics',
        moduleExpression: 'AnalyticsModule.forRoot()',
      },
    ],
  },
  websockets: {
    id: 'websockets',
    label: 'WebSockets',
    activation: 'source-library',
    requiresCapabilities: [],
    requiresApps: [],
    conflictsWith: [],
    ownedProjects: ['@app/common-websocket'],
    dockerServices: [],
    environmentVariables: ['WEBSOCKET_ALLOWED_ORIGINS'],
    backendWiring: [],
  },
  'feature-flags': {
    id: 'feature-flags',
    label: 'Feature Flags',
    activation: 'nest-module',
    requiresCapabilities: [],
    requiresApps: [],
    conflictsWith: [],
    requiresDurableDatabase: true,
    ownedProjects: ['@app/common-feature-flags'],
    providerOwnedProjects: {
      postgres: ['@app/backend-postgres-main-feature-flags'],
      mongodb: ['@app/backend-mongodb-main-feature-flags'],
    },
    dockerServices: [],
    environmentVariables: [],
    backendWiring: [],
    providerBackendWiring: {
      postgres: [
        {
          hosts: 'selected-backend',
          importName: 'FeatureFlagsPostgresModule',
          importPath: '@app/backend-postgres-main-feature-flags',
          moduleExpression: 'FeatureFlagsPostgresModule',
        },
      ],
      mongodb: [
        {
          hosts: 'selected-backend',
          importName: 'FeatureFlagsMongoPersistenceModule',
          importPath: '@app/backend-mongodb-main-feature-flags',
          moduleExpression: 'FeatureFlagsMongoPersistenceModule',
        },
      ],
    },
  },
  notifications: {
    id: 'notifications',
    label: 'Notifications',
    activation: 'nest-module',
    requiresCapabilities: ['s3'],
    requiresApps: ['notification-consumer', 'notification-scheduler'],
    conflictsWith: [],
    requiresDurableDatabase: true,
    ownedProjects: [
      '@app/common-notifications',
      '@app/backend-feature-notification-shared',
      '@app/backend-feature-notification-main',
    ],
    providerOwnedProjects: {
      postgres: ['@app/backend-postgres-main-notification'],
      mongodb: ['@app/backend-mongodb-main-notification'],
    },
    dockerServices: ['notification-consumer', 'notification-scheduler'],
    environmentVariables: [
      'NOTIFICATION_DELIVERIES_PER_ITERATION',
      'NOTIFICATION_REQUESTS_PER_SECOND',
      'NOTIFICATION_DELIVERIES_PARTITION_AHEAD_MONTHS',
      'NOTIFICATION_EMAIL_PROVIDER',
      'NOTIFICATION_EMAIL_FROM',
      'NOTIFICATION_PAYLOAD_ENCRYPTION_KEY',
      'NOTIFICATION_BROADCAST_REQUIRE_INDEPENDENT_APPROVAL',
      'NOTIFICATION_CONSUMER_INTERVAL_MS',
      'NOTIFICATION_MATERIALIZATION_CHUNK_SIZE',
      'NOTIFICATION_CSV_MAX_BYTES',
      'NOTIFICATION_CSV_MAX_ROWS',
      'RESEND_API_KEY',
      'MAILPACE_SERVER_TOKEN',
      'NOTIFICATION_FCM_PROJECT_ID',
      'NOTIFICATION_FCM_CLIENT_EMAIL',
      'NOTIFICATION_FCM_PRIVATE_KEY',
      'NOTIFICATION_FCM_PRIVATE_KEY_FILE',
      'NOTIFICATION_FCM_TOKEN_URI',
      'NOTIFICATION_APNS_TEAM_ID',
      'NOTIFICATION_APNS_KEY_ID',
      'NOTIFICATION_APNS_BUNDLE_ID',
      'NOTIFICATION_APNS_PRIVATE_KEY',
      'NOTIFICATION_APNS_PRIVATE_KEY_FILE',
      'NOTIFICATION_APNS_SANDBOX',
    ],
    backendWiring: [
      {
        hosts: ['user-app-api', 'auth-app-api', 'discord-app-api', 'telegram-bot-api'],
        importName: 'NotificationMainModule',
        importPath: '@app/backend-feature-notification-main',
        moduleExpression: 'NotificationMainModule.forRoot({ enableScheduler: false, exposeHttp: false })',
      },
      {
        hosts: ['notification-scheduler'],
        importName: 'NotificationMainModule',
        importPath: '@app/backend-feature-notification-main',
        moduleExpression: 'NotificationMainModule.forRoot({ enableScheduler: true, exposeHttp: false })',
      },
      {
        hosts: ['notification-consumer'],
        importName: 'NotificationMainModule',
        importPath: '@app/backend-feature-notification-main',
        moduleExpression: 'NotificationMainModule.forRoot({ enableConsumer: true, exposeHttp: false })',
      },
    ],
    providerBackendWiring: {
      postgres: [
        {
          hosts: 'selected-backend',
          importName: 'NotificationPostgresModule',
          importPath: '@app/backend-postgres-main-notification',
          moduleExpression: 'NotificationPostgresModule',
        },
      ],
      mongodb: [
        {
          hosts: 'selected-backend',
          importName: 'NotificationMongoPersistenceModule',
          importPath: '@app/backend-mongodb-main-notification',
          moduleExpression: 'NotificationMongoPersistenceModule',
        },
      ],
    },
  },
  'design-tokens': {
    id: 'design-tokens',
    label: 'Design Tokens',
    activation: 'source-library',
    requiresCapabilities: [],
    requiresApps: [],
    conflictsWith: [],
    ownedProjects: ['@app/common-design-tokens'],
    dockerServices: [],
    environmentVariables: [],
    backendWiring: [],
  },
  authz: {
    id: 'authz',
    label: 'Authorization',
    activation: 'source-library',
    requiresCapabilities: [],
    requiresApps: [],
    conflictsWith: [],
    ownedProjects: ['@app/common-authz'],
    dockerServices: [],
    environmentVariables: [],
    backendWiring: [],
  },
  postgres: {
    id: 'postgres',
    label: 'PostgreSQL Database',
    activation: 'infrastructure',
    requiresCapabilities: [],
    requiresApps: [],
    conflictsWith: ['mongodb'],
    ownedProjects: ['@app/backend-postgres-main', '@app/backend-postgres-main-auth'],
    dockerServices: ['postgres', 'migrate'],
    environmentVariables: ['DATABASE_URL'],
    providerTelemetryInstrumentation: {
      importName: 'createPostgresOpenTelemetryInstrumentations',
      importPath: '@app/backend-postgres-main-otel',
    },
    backendWiring: [
      {
        hosts: 'selected-backend',
        importName: 'PostgresMainModule',
        importPath: '@app/backend-postgres-main',
        moduleExpression: 'PostgresMainModule.forRoot()',
      },
      {
        hosts: 'selected-backend',
        importName: 'AuthPostgresModule',
        importPath: '@app/backend-postgres-main-auth',
        moduleExpression: 'AuthPostgresModule',
      },
    ],
  },
  mongodb: {
    id: 'mongodb',
    label: 'MongoDB Database',
    activation: 'infrastructure',
    requiresCapabilities: [],
    requiresApps: [],
    conflictsWith: ['postgres'],
    ownedProjects: ['@app/backend-mongodb-main', '@app/backend-mongodb-main-auth'],
    dockerServices: ['mongodb', 'mongodb-init', 'mongodb-migrate'],
    environmentVariables: ['MONGODB_URI', 'MONGODB_DATABASE', 'MONGODB_REPLICA_SET'],
    providerTelemetryInstrumentation: {
      importName: 'createMongoOpenTelemetryInstrumentations',
      importPath: '@app/backend-mongodb-main-otel',
    },
    backendWiring: [
      {
        hosts: 'selected-backend',
        importName: 'MongoMainModule',
        importPath: '@app/backend-mongodb-main',
        moduleExpression: 'MongoMainModule.forRoot()',
      },
      {
        hosts: 'selected-backend',
        importName: 'AuthMongoPersistenceModule',
        importPath: '@app/backend-mongodb-main-auth',
        moduleExpression: 'AuthMongoPersistenceModule',
      },
    ],
  },
  redis: {
    id: 'redis',
    label: 'Redis Cache',
    activation: 'nest-module',
    requiresCapabilities: [],
    requiresApps: [],
    conflictsWith: [],
    ownedProjects: ['@app/backend-common-redis'],
    dockerServices: ['redis'],
    environmentVariables: ['REDIS_URL'],
    backendWiring: [
      {
        hosts: ['admin-app-api', 'auth-app-api', 'notification-consumer', 'notification-scheduler', 'user-app-api'],
        importName: 'RedisModule',
        importPath: '@app/backend-common-redis',
        moduleExpression: 'RedisModule.forRoot()',
      },
    ],
  },
  s3: {
    id: 's3',
    label: 'S3 Object Storage',
    activation: 'nest-module',
    requiresCapabilities: [],
    requiresApps: [],
    conflictsWith: [],
    ownedProjects: ['@app/backend-common-s3'],
    dockerServices: ['minio'],
    environmentVariables: [
      'S3_ENDPOINT',
      'S3_BUCKET',
      'S3_REGION',
      'S3_ACCESS_KEY',
      'S3_SECRET_KEY',
      'S3_FORCE_PATH_STYLE',
    ],
    backendWiring: [
      {
        hosts: 'selected-backend',
        importName: 'S3Module',
        importPath: '@app/backend-common-s3',
        moduleExpression: 'S3Module.forRoot()',
      },
    ],
  },
  'static-data': {
    id: 'static-data',
    label: 'Static Data',
    activation: 'nest-module',
    requiresCapabilities: [],
    requiresApps: [],
    conflictsWith: [],
    ownedProjects: ['@app/backend-common-static'],
    dockerServices: [],
    environmentVariables: ['STATIC_DATA_ROOT'],
    backendWiring: [
      {
        hosts: 'selected-backend',
        importName: 'StaticDataModule',
        importPath: '@app/backend-common-static',
        moduleExpression: "StaticDataModule.forRoot({ rootDir: process.env['STATIC_DATA_ROOT'] ?? 'data' })",
      },
    ],
  },
  nats: {
    id: 'nats',
    label: 'NATS Messaging',
    activation: 'nest-module',
    requiresCapabilities: [],
    requiresApps: [],
    conflictsWith: [],
    ownedProjects: ['@app/backend-common-nats'],
    dockerServices: ['nats'],
    environmentVariables: ['NATS_SERVERS'],
    backendWiring: [
      {
        hosts: 'selected-backend',
        importName: 'NatsModule',
        importPath: '@app/backend-common-nats',
        moduleExpression: 'NatsModule.forRoot()',
      },
    ],
  },
  otel: {
    id: 'otel',
    label: 'OpenTelemetry Observability',
    activation: 'bootstrap',
    requiresCapabilities: [],
    requiresApps: [],
    conflictsWith: [],
    ownedProjects: ['@app/backend-common-otel'],
    dockerServices: [],
    environmentVariables: ['OTEL_ENABLED', 'OTEL_EXPORTER_OTLP_ENDPOINT'],
    telemetryWiring: {
      hosts: 'selected-backend',
      initializer: {
        importName: 'initOpenTelemetry',
        importPath: '@app/backend-common-otel',
      },
      instrumentationFactory: {
        importName: 'createOpenTelemetryInstrumentations',
        importPath: '@app/backend-common-otel',
      },
    },
    backendWiring: [],
  },
  swagger: {
    id: 'swagger',
    label: 'Swagger API Docs',
    activation: 'bootstrap',
    requiresCapabilities: [],
    requiresApps: [],
    conflictsWith: [],
    ownedProjects: ['@app/backend-common-swagger'],
    dockerServices: [],
    environmentVariables: ['OPENAPI_ENABLED', 'OPENAPI_PATH'],
    backendWiring: [],
  },
  'telegram-bot': {
    id: 'telegram-bot',
    label: 'Telegram Bot Integration',
    activation: 'application',
    requiresCapabilities: [],
    requiresApps: ['auth-app-api', 'telegram-bot-api', 'user-app', 'user-app-api'],
    conflictsWith: [],
    ownedProjects: ['@app/backend-feature-telegram-shared', '@app/backend-feature-telegram-bot'],
    dockerServices: ['telegram-bot-api'],
    environmentVariables: [
      'AUTH_ALLOWED_RETURN_URLS',
      'AUTH_TELEGRAM_ENABLED',
      'BETTER_AUTH_SECRET',
      'BETTER_AUTH_URL',
      'BETTER_AUTH_TRUSTED_ORIGINS',
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_BOT_MODE',
      'TELEGRAM_MINI_APP_URL',
      'TELEGRAM_OIDC_CLIENT_ID',
      'TELEGRAM_OIDC_CLIENT_SECRET',
      'TELEGRAM_OIDC_ENABLED',
      'TELEGRAM_TMA_MAX_AGE_SECONDS',
      'VITE_TELEGRAM_AUTH_ENABLED',
    ],
    backendWiring: [],
  },
  'discord-bot': {
    id: 'discord-bot',
    label: 'Discord Bot Integration',
    activation: 'application',
    requiresCapabilities: [],
    requiresApps: ['discord-app-api'],
    conflictsWith: [],
    ownedProjects: ['@app/backend-feature-discord-bot'],
    dockerServices: ['discord-app-api'],
    environmentVariables: ['DISCORD_BOT_TOKEN', 'DISCORD_APPLICATION_ID', 'DISCORD_PUBLIC_KEY'],
    backendWiring: [],
  },
  tenancy: {
    id: 'tenancy',
    label: 'Multi-tenancy (PostgreSQL row-level security)',
    activation: 'nest-module',
    requiresCapabilities: [],
    requiresApps: [],
    // PostgreSQL only, and deliberately a hard conflict rather than a silent
    // downgrade: MongoDB has no row-level security, so the equivalent guard is a
    // repository-layer filter that does not exist yet. Selecting tenancy on
    // MongoDB would promise an isolation guarantee nothing enforces.
    conflictsWith: ['mongodb'],
    requiresDurableDatabase: true,
    ownedProjects: ['@app/backend-common-tenant-context'],
    providerOwnedProjects: {
      postgres: ['@app/backend-common-tenant-policy'],
    },
    dockerServices: [],
    // No environment variables on purpose. The role names are compile-time
    // constants: migration DDL is recorded in the ledger, so a name read from
    // the environment would let two deployments of the same migration grant
    // policies to different roles.
    environmentVariables: [],
    backendWiring: [],
    // No runtime wiring yet, deliberately.
    //
    // `TenantContextModule.forRoot()` registers a FAIL-CLOSED interceptor: a
    // tenant-scoped request that resolves no tenant is refused. That is correct
    // only once every scoped route can actually resolve one, and no repository
    // routes through `withTenantTransaction` yet. Registering it now turned
    // `GET /api/auth/get-session` into a 500 in the enterprise preset's e2e
    // suite — the interceptor working exactly as designed, against an
    // application that cannot yet satisfy it.
    //
    // So the capability currently ships the DATABASE half: the policies, the
    // roles, and the migrations, all opt-in. The module exists and is tested;
    // it gets wired here in the same change that routes the repositories,
    // because the two are only correct together. See
    // docs/multi-tenancy-capability.md, stage 1.
    providerBackendWiring: {},
    // Deep relative paths, never the package barrel. `@app/backend-postgres-main-auth`
    // re-exports auth-postgres.module.ts, so importing the barrel pulls
    // @app/backend-feature-auth-shared → rbac.guard.ts → @nestjs/core into the
    // pruned migrator image, which has no web framework by design — the exact
    // failure commit 7da7d30b fixed by moving the policy DDL into a leaf lib.
    // The migration modules themselves import only @mikro-orm/migrations and the
    // dependency-free @app/backend-common-tenant-policy. Matches the shape of
    // generated-mongo-migrations.ts, which is relative for the same reason.
    providerMigrations: {
      postgres: [
        {
          importName: 'Migration20260803120000TenantRowLevelSecurity',
          importPath:
            '../../../../../libs/backend/postgres/main/auth/lib/src/infrastructure/data-access/migrations/Migration20260803120000TenantRowLevelSecurity.ts',
        },
        {
          importName: 'Migration20260803121000NotificationTenantRowLevelSecurity',
          importPath:
            '../../../../../libs/backend/postgres/main/notification/lib/src/infrastructure/data-access/migrations/Migration20260803121000NotificationTenantRowLevelSecurity.ts',
        },
      ],
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  /** Type of issue. */
  type: 'missing_dependency' | 'conflict' | 'unknown_app' | 'unknown_capability';
  /** Human-readable message. */
  message: string;
  /** The entity that caused the issue. */
  entity: string;
}

export const durableDatabaseProviderIds = [
  'postgres',
  'mongodb',
] as const satisfies readonly DurableDatabaseProviderId[];

/**
 * Validate a set of app IDs and capability IDs against the catalog.
 *
 * Returns an array of issues (empty when valid).  Checks:
 *  1. Every app's `requiresCapabilities` is satisfied.
 *  2. Every app's `requiresApps` is satisfied.
 *  3. No app is listed in a capability's `conflictsWithCapabilities`.
 *  4. Every capability's `requiresCapabilities` is satisfied.
 *  5. No two conflicting capabilities are both enabled.
 *  6. Database-dependent selections have one durable database provider.
 */
export function validateSelection(
  apps: readonly AppId[],
  capabilities: readonly CapabilityId[],
): readonly ValidationIssue[] {
  const capSet = new Set(capabilities);
  const appSet = new Set(apps);
  const issues: ValidationIssue[] = [];
  const databaseDependants: string[] = [];

  for (const appId of apps) {
    const app = appCatalog[appId];
    if (!app) {
      issues.push({
        type: 'unknown_app',
        entity: appId,
        message: `Unknown app ID: ${appId}`,
      });
      continue;
    }

    if (app.requiresDurableDatabase) {
      databaseDependants.push(appId);
    }

    // Check required capabilities
    for (const reqCap of app.requiresCapabilities) {
      if (!capSet.has(reqCap)) {
        issues.push({
          type: 'missing_dependency',
          entity: appId,
          message: `${app.label} requires capability "${reqCap}"`,
        });
      }
    }

    // Check required apps
    for (const reqApp of app.requiresApps) {
      if (!appSet.has(reqApp)) {
        issues.push({
          type: 'missing_dependency',
          entity: appId,
          message: `${app.label} requires app "${reqApp}"`,
        });
      }
    }

    // Check capability conflicts
    for (const conflictCap of app.conflictsWithCapabilities) {
      if (capSet.has(conflictCap)) {
        issues.push({
          type: 'conflict',
          entity: appId,
          message: `${app.label} conflicts with capability "${conflictCap}"`,
        });
      }
    }
  }

  // Capability-level checks
  for (const capId of capabilities) {
    const cap = capabilityCatalog[capId];
    if (!cap) {
      issues.push({
        type: 'unknown_capability',
        entity: capId,
        message: `Unknown capability ID: ${capId}`,
      });
      continue;
    }

    if (cap.requiresDurableDatabase) {
      databaseDependants.push(capId);
    }

    // Required capabilities
    for (const reqCap of cap.requiresCapabilities) {
      if (!capSet.has(reqCap)) {
        issues.push({
          type: 'missing_dependency',
          entity: capId,
          message: `${cap.label} requires capability "${reqCap}"`,
        });
      }
    }

    for (const reqApp of cap.requiresApps) {
      if (!appSet.has(reqApp)) {
        issues.push({
          type: 'missing_dependency',
          entity: capId,
          message: `${cap.label} requires app "${reqApp}"`,
        });
      }
    }

    // Conflicts
    for (const conflict of cap.conflictsWith) {
      if (capSet.has(conflict)) {
        issues.push({
          type: 'conflict',
          entity: capId,
          message: `${cap.label} conflicts with capability "${conflict}"`,
        });
      }
    }
  }

  const selectedDatabaseProviders = durableDatabaseProviderIds.filter((provider) => capSet.has(provider));
  if (databaseDependants.length > 0 && selectedDatabaseProviders.length === 0) {
    issues.push({
      type: 'missing_dependency',
      entity: databaseDependants[0] ?? 'database',
      message: `${databaseDependants.join(', ')} require exactly one durable database provider ("postgres" or "mongodb")`,
    });
  }

  return issues;
}

/**
 * Expand a selection by transitively adding all required dependencies.
 *
 * Returns a new tuple `[apps, capabilities]` with everything resolved.
 * Does NOT resolve conflicts — those remain as validation issues.
 */
export function expandDependencies(
  apps: readonly AppId[],
  capabilities: readonly CapabilityId[],
): { apps: AppId[]; capabilities: CapabilityId[] } {
  const capSet = new Set(capabilities);
  const appSet = new Set(apps);

  // Transitively resolve capability requirements
  let changed = true;
  while (changed) {
    changed = false;
    for (const appId of [...appSet]) {
      const app = appCatalog[appId];
      if (!app) {
        continue;
      }
      for (const reqCap of app.requiresCapabilities) {
        if (!capSet.has(reqCap)) {
          capSet.add(reqCap);
          changed = true;
        }
      }
      for (const reqApp of app.requiresApps) {
        if (!appSet.has(reqApp)) {
          appSet.add(reqApp);
          changed = true;
        }
      }
    }
    for (const capId of [...capSet]) {
      const cap = capabilityCatalog[capId];
      if (!cap) {
        continue;
      }
      for (const reqCap of cap.requiresCapabilities) {
        if (!capSet.has(reqCap)) {
          capSet.add(reqCap);
          changed = true;
        }
      }
      for (const reqApp of cap.requiresApps) {
        if (!appSet.has(reqApp)) {
          appSet.add(reqApp);
          changed = true;
        }
      }
    }
  }

  return {
    apps: [...appSet].sort(),
    capabilities: [...capSet].sort(),
  };
}
