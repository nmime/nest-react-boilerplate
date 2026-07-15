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
    requiresCapabilities: ['authz', 'design-tokens'],
    requiresApps: ['admin-app-api'],
    conflictsWithCapabilities: [],
  },
  'user-app': {
    id: 'user-app',
    label: 'User Application',
    platform: 'frontend',
    requiresCapabilities: ['design-tokens', 'i18n'],
    requiresApps: ['user-app-api', 'auth-app-api'],
    conflictsWithCapabilities: [],
  },
  'landing-app': {
    id: 'landing-app',
    label: 'Landing Page',
    platform: 'frontend',
    requiresCapabilities: [],
    requiresApps: [],
    conflictsWithCapabilities: [],
  },
  'site-app': {
    id: 'site-app',
    label: 'Marketing Site',
    platform: 'frontend',
    requiresCapabilities: [],
    requiresApps: [],
    conflictsWithCapabilities: [],
  },
  'mobile-app': {
    id: 'mobile-app',
    label: 'Mobile App',
    platform: 'frontend',
    requiresCapabilities: ['design-tokens'],
    requiresApps: ['user-app-api'],
    conflictsWithCapabilities: [],
  },

  /* --- Backend apps --- */
  'admin-app-api': {
    id: 'admin-app-api',
    label: 'Admin API',
    platform: 'backend',
    requiresCapabilities: ['postgres', 'authz'],
    requiresApps: [],
    conflictsWithCapabilities: [],
  },
  'user-app-api': {
    id: 'user-app-api',
    label: 'User API',
    platform: 'backend',
    requiresCapabilities: ['postgres'],
    requiresApps: [],
    conflictsWithCapabilities: [],
  },
  'auth-app-api': {
    id: 'auth-app-api',
    label: 'Auth API',
    platform: 'backend',
    requiresCapabilities: ['postgres'],
    requiresApps: [],
    conflictsWithCapabilities: [],
  },
  'discord-app-api': {
    id: 'discord-app-api',
    label: 'Discord Bot API',
    platform: 'backend',
    requiresCapabilities: ['discord-bot', 'postgres'],
    requiresApps: [],
    conflictsWithCapabilities: [],
  },
  'telegram-bot-api': {
    id: 'telegram-bot-api',
    label: 'Telegram Bot API',
    platform: 'backend',
    requiresCapabilities: ['telegram-bot', 'postgres'],
    requiresApps: [],
    conflictsWithCapabilities: [],
  },
  /* --- E2E --- */
  'fullstack-e2e': {
    id: 'fullstack-e2e',
    label: 'Fullstack E2E Tests',
    platform: 'e2e',
    requiresCapabilities: [],
    requiresApps: ['auth-app-api', 'user-app-api'],
    conflictsWithCapabilities: [],
  },
} as const;

// ---------------------------------------------------------------------------
// Capability metadata
// ---------------------------------------------------------------------------

export interface CapabilityEntry {
  /** Stable identifier. */
  id: CapabilityId;
  /** Short human-readable label. */
  label: string;
  /** Other capabilities that must be enabled. */
  requiresCapabilities: CapabilityId[];
  /** Capabilities that conflict with this one. */
  conflictsWith: CapabilityId[];
}

/**
 * Full catalog of supported capabilities.
 *
 * Indexed by capability ID for O(1) lookup.
 */
export const capabilityCatalog: Readonly<Record<CapabilityId, Readonly<CapabilityEntry>>> = {
  i18n: {
    id: 'i18n',
    label: 'Internationalization',
    requiresCapabilities: [],
    conflictsWith: [],
  },
  analytics: {
    id: 'analytics',
    label: 'Analytics Tracking',
    requiresCapabilities: [],
    conflictsWith: [],
  },
  websockets: {
    id: 'websockets',
    label: 'WebSockets',
    requiresCapabilities: [],
    conflictsWith: [],
  },
  'feature-flags': {
    id: 'feature-flags',
    label: 'Feature Flags',
    requiresCapabilities: [],
    conflictsWith: [],
  },
  notifications: {
    id: 'notifications',
    label: 'Notifications',
    requiresCapabilities: ['redis'],
    conflictsWith: [],
  },
  'design-tokens': {
    id: 'design-tokens',
    label: 'Design Tokens',
    requiresCapabilities: [],
    conflictsWith: [],
  },
  authz: {
    id: 'authz',
    label: 'Authorization',
    requiresCapabilities: [],
    conflictsWith: [],
  },
  postgres: {
    id: 'postgres',
    label: 'PostgreSQL Database',
    requiresCapabilities: [],
    conflictsWith: [],
  },
  redis: {
    id: 'redis',
    label: 'Redis Cache',
    requiresCapabilities: [],
    conflictsWith: [],
  },
  s3: {
    id: 's3',
    label: 'S3 Object Storage',
    requiresCapabilities: [],
    conflictsWith: [],
  },
  nats: {
    id: 'nats',
    label: 'NATS Messaging',
    requiresCapabilities: [],
    conflictsWith: [],
  },
  otel: {
    id: 'otel',
    label: 'OpenTelemetry Observability',
    requiresCapabilities: [],
    conflictsWith: [],
  },
  swagger: {
    id: 'swagger',
    label: 'Swagger API Docs',
    requiresCapabilities: [],
    conflictsWith: [],
  },
  'telegram-bot': {
    id: 'telegram-bot',
    label: 'Telegram Bot Integration',
    requiresCapabilities: [],
    conflictsWith: [],
  },
  'discord-bot': {
    id: 'discord-bot',
    label: 'Discord Bot Integration',
    requiresCapabilities: [],
    conflictsWith: [],
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
    }
  }

  return {
    apps: [...appSet].sort(),
    capabilities: [...capSet].sort(),
  };
}
