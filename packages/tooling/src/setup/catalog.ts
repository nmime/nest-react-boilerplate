/**
 * Catalog of applications, capabilities, and their dependency / conflict
 * rules.  Pure data — no side-effects, no filesystem access.
 */
import type { AppId, CapabilityId } from './schema.js';

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
  /** Canonical template hostname; non-deployable projects use null. */
  publicHostname: string | null;
  /** Capabilities that this app REQUIRES when present. */
  requiresCapabilities: CapabilityId[];
  /** Other apps that must be present when this app is enabled. */
  requiresApps: AppId[];
  /** Capabilities that conflict with this app. */
  conflictsWithCapabilities: CapabilityId[];
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
    publicHostname: 'admin-app.example.com',
    requiresCapabilities: ['authz'],
    requiresApps: ['admin-app-api', 'auth-app-api'],
    conflictsWithCapabilities: [],
  },
  'user-app': {
    id: 'user-app',
    label: 'User Application',
    platform: 'frontend',
    classification: 'reference',
    runtime: 'React + Vite SPA',
    publicHostname: 'user-app.example.com',
    requiresCapabilities: ['i18n'],
    requiresApps: ['user-app-api', 'auth-app-api'],
    conflictsWithCapabilities: [],
  },
  'landing-app': {
    id: 'landing-app',
    label: 'Landing Page',
    platform: 'frontend',
    classification: 'reference',
    runtime: 'Astro + React islands',
    publicHostname: 'example.com',
    requiresCapabilities: [],
    requiresApps: [],
    conflictsWithCapabilities: [],
  },
  'site-app': {
    id: 'site-app',
    label: 'Marketing Site',
    platform: 'frontend',
    classification: 'reference',
    runtime: 'Vike + React SSR',
    publicHostname: 'site-app.example.com',
    requiresCapabilities: [],
    requiresApps: [],
    conflictsWithCapabilities: [],
  },
  'mobile-app': {
    id: 'mobile-app',
    label: 'Mobile App',
    platform: 'frontend',
    classification: 'reference',
    runtime: 'Expo + React Native',
    publicHostname: 'mobile-app.example.com',
    requiresCapabilities: ['design-tokens'],
    requiresApps: ['auth-app-api', 'user-app-api'],
    conflictsWithCapabilities: [],
  },

  /* --- Backend apps --- */
  'admin-app-api': {
    id: 'admin-app-api',
    label: 'Admin API',
    platform: 'backend',
    classification: 'reference',
    runtime: 'NestJS + Fastify API',
    publicHostname: 'admin-app-api.example.com',
    requiresCapabilities: ['postgres', 'authz', 'notifications'],
    requiresApps: [],
    conflictsWithCapabilities: [],
  },
  'user-app-api': {
    id: 'user-app-api',
    label: 'User API',
    platform: 'backend',
    classification: 'reference',
    runtime: 'NestJS + Fastify API',
    publicHostname: 'user-app-api.example.com',
    requiresCapabilities: ['postgres'],
    requiresApps: [],
    conflictsWithCapabilities: [],
  },
  'auth-app-api': {
    id: 'auth-app-api',
    label: 'Auth API',
    platform: 'backend',
    classification: 'reference',
    runtime: 'NestJS + Fastify API',
    publicHostname: 'auth-app-api.example.com',
    requiresCapabilities: ['postgres'],
    requiresApps: [],
    conflictsWithCapabilities: [],
  },
  'discord-app-api': {
    id: 'discord-app-api',
    label: 'Discord Bot API',
    platform: 'backend',
    classification: 'optional',
    runtime: 'NestJS + Fastify integration API',
    publicHostname: 'discord-app-api.example.com',
    requiresCapabilities: ['discord-bot', 'postgres'],
    requiresApps: [],
    conflictsWithCapabilities: [],
  },
  'telegram-bot-api': {
    id: 'telegram-bot-api',
    label: 'Telegram Bot API',
    platform: 'backend',
    classification: 'optional',
    runtime: 'NestJS + Fastify bot API',
    publicHostname: 'telegram-bot-api.example.com',
    requiresCapabilities: ['telegram-bot', 'postgres'],
    requiresApps: [],
    conflictsWithCapabilities: [],
  },
  'notification-scheduler': {
    id: 'notification-scheduler',
    label: 'Notification Scheduler',
    platform: 'backend',
    classification: 'optional',
    runtime: 'NestJS scheduled-job process',
    publicHostname: null,
    requiresCapabilities: ['postgres'],
    requiresApps: [],
    conflictsWithCapabilities: [],
  },
  'notification-consumer': {
    id: 'notification-consumer',
    label: 'Notification Consumer',
    platform: 'backend',
    classification: 'optional',
    runtime: 'NestJS background consumer process',
    publicHostname: null,
    requiresCapabilities: ['postgres', 's3'],
    requiresApps: [],
    conflictsWithCapabilities: [],
  },
  /* --- E2E --- */
  'fullstack-e2e': {
    id: 'fullstack-e2e',
    label: 'Fullstack E2E Tests',
    platform: 'e2e',
    classification: 'reference',
    runtime: 'Playwright full-stack tests',
    publicHostname: null,
    requiresCapabilities: [],
    requiresApps: ['admin-app', 'admin-app-api', 'auth-app-api', 'landing-app', 'user-app', 'user-app-api'],
    conflictsWithCapabilities: [],
  },
} as const;

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
  ownedProjects: string[];
  dockerServices: string[];
  environmentVariables: string[];
  backendWiring: BackendModuleWiring[];
}

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

export interface BackendCapabilityModuleEntry {
  path: string;
  className: string;
}

export const backendCapabilityModuleCatalog: Readonly<Partial<Record<AppId, Readonly<BackendCapabilityModuleEntry>>>> =
  {
    'admin-app-api': {
      path: 'apps/backend/admin/admin-app-api/src/capabilities.generated.ts',
      className: 'AdminAppApiCapabilitiesModule',
    },
    'user-app-api': {
      path: 'apps/backend/user/user-app-api/src/capabilities.generated.ts',
      className: 'UserAppApiCapabilitiesModule',
    },
    'auth-app-api': {
      path: 'apps/backend/auth/auth-app-api/src/capabilities.generated.ts',
      className: 'AuthAppApiCapabilitiesModule',
    },
    'discord-app-api': {
      path: 'apps/backend/discord/discord-app-api/src/capabilities.generated.ts',
      className: 'DiscordAppApiCapabilitiesModule',
    },
    'telegram-bot-api': {
      path: 'apps/backend/telegram/telegram-bot-api/src/capabilities.generated.ts',
      className: 'TelegramBotApiCapabilitiesModule',
    },
    'notification-scheduler': {
      path: 'apps/backend/notification/notification-scheduler/src/capabilities.generated.ts',
      className: 'NotificationSchedulerCapabilitiesModule',
    },
    'notification-consumer': {
      path: 'apps/backend/notification/notification-consumer/src/capabilities.generated.ts',
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
    requiresCapabilities: ['postgres'],
    requiresApps: [],
    conflictsWith: [],
    ownedProjects: ['@app/common-feature-flags', '@app/backend-postgres-main-feature-flags'],
    dockerServices: ['postgres'],
    environmentVariables: [],
    backendWiring: [
      {
        hosts: 'selected-backend',
        importName: 'FeatureFlagsPostgresModule',
        importPath: '@app/backend-postgres-main-feature-flags',
        moduleExpression: 'FeatureFlagsPostgresModule',
      },
    ],
  },
  notifications: {
    id: 'notifications',
    label: 'Notifications',
    activation: 'nest-module',
    requiresCapabilities: ['postgres', 's3'],
    requiresApps: ['notification-consumer', 'notification-scheduler'],
    conflictsWith: [],
    ownedProjects: [
      '@app/common-notifications',
      '@app/backend-feature-notification-shared',
      '@app/backend-feature-notification-main',
      '@app/backend-postgres-main-notification',
    ],
    dockerServices: ['postgres', 'notification-consumer', 'notification-scheduler'],
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
    conflictsWith: [],
    ownedProjects: ['@app/backend-postgres-main'],
    dockerServices: ['postgres', 'migrate'],
    environmentVariables: ['DATABASE_URL'],
    backendWiring: [],
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
        hosts: 'selected-backend',
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

/**
 * Validate a set of app IDs and capability IDs against the catalog.
 *
 * Returns an array of issues (empty when valid).  Checks:
 *  1. Every app's `requiresCapabilities` is satisfied.
 *  2. Every app's `requiresApps` is satisfied.
 *  3. No app is listed in a capability's `conflictsWithCapabilities`.
 *  4. Every capability's `requiresCapabilities` is satisfied.
 *  5. No two conflicting capabilities are both enabled.
 */
export function validateSelection(
  apps: readonly AppId[],
  capabilities: readonly CapabilityId[],
): readonly ValidationIssue[] {
  const capSet = new Set(capabilities);
  const appSet = new Set(apps);
  const issues: ValidationIssue[] = [];

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
