/**
 * Deterministic preset definitions for boilerplate setup.
 *
 * Each preset is a pure data structure that maps to a fixed set of apps and
 * capabilities.  Preset expansion is deterministic — the same preset always
 * produces the same sorted arrays.
 *
 * After expansion through `catalog.expandDependencies`, the final set may
 * include additional transitive dependencies.
 */
import type { AppId, CapabilityId, PresetId } from './schema.js';
import { presetIds } from './schema.js';
import { expandDependencies } from './catalog.js';

// ---------------------------------------------------------------------------
// Preset definitions
// ---------------------------------------------------------------------------

export interface PresetDefinition {
  /** One of the five preset IDs. */
  id: PresetId;
  /** Short description of what this preset targets. */
  description: string;
  /** Apps enabled by this preset (before dependency expansion). */
  apps: readonly AppId[];
  /** Capabilities enabled by this preset (before dependency expansion). */
  capabilities: readonly CapabilityId[];
}

/**
 * Five supported presets, ordered from the smallest specialized profile to
 * the complete repository profile.
 *
 * Arrays are source-sorted for readability; `expandPreset` returns
 * canonical (sorted + expanded) arrays.
 */
export const presets: ReadonlyArray<Readonly<PresetDefinition>> = [
  /**
   * Minimal: a single API + auth.  Good for prototyping or library-style
   * backends.
   */
  {
    id: 'minimal',
    description: 'Single API with auth — minimal backend footprint',
    apps: ['auth-app-api', 'user-app-api'],
    capabilities: ['postgres'],
  },

  /**
   * Web: every core browser application with its APIs and end-to-end project.
   */
  {
    id: 'web',
    description: 'All core web apps, APIs, and E2E coverage — web-only workspace',
    apps: [
      'admin-app',
      'admin-app-api',
      'user-app',
      'user-app-api',
      'auth-app-api',
      'landing-app',
      'site-app',
      'fullstack-e2e',
    ],
    capabilities: ['postgres', 'redis', 'design-tokens', 'authz', 'i18n', 'otel', 'swagger'],
  },

  /**
   * Fullstack: every core product app, API, renderer, and E2E project. Bot
   * integrations remain an explicit opt-in through bots or enterprise.
   */
  {
    id: 'fullstack',
    description: 'All core apps with standard capabilities — production-ready',
    apps: [
      'admin-app',
      'admin-app-api',
      'user-app',
      'user-app-api',
      'auth-app-api',
      'landing-app',
      'site-app',
      'mobile-app',
      'fullstack-e2e',
    ],
    capabilities: ['postgres', 'redis', 'design-tokens', 'authz', 'i18n', 'otel', 'swagger'],
  },

  /**
   * Enterprise: every supported app and capability.  For organisations that
   * want the complete stack out of the box.
   */
  {
    id: 'enterprise',
    description: 'Every supported app and capability — complete stack',
    apps: [
      'admin-app',
      'admin-app-api',
      'user-app',
      'user-app-api',
      'auth-app-api',
      'landing-app',
      'site-app',
      'mobile-app',
      'discord-app-api',
      'telegram-bot-api',
      'notification-consumer',
      'notification-scheduler',
      'fullstack-e2e',
    ],
    capabilities: [
      'postgres',
      'redis',
      's3',
      'static-data',
      'nats',
      'otel',
      'swagger',
      'i18n',
      'analytics',
      'websockets',
      'feature-flags',
      'notifications',
      'design-tokens',
      'authz',
      'telegram-bot',
      'discord-bot',
    ],
  },

  /**
   * Bots: bot-focused setup with Telegram + Discord integrations.
   */
  {
    id: 'bots',
    description: 'Telegram + Discord bots — bot-first setup',
    apps: ['auth-app-api', 'user-app-api', 'telegram-bot-api', 'discord-app-api'],
    capabilities: ['postgres', 'redis', 'telegram-bot', 'discord-bot', 'otel'],
  },
] as const;

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

const PRESET_MAP = new Map<PresetId, PresetDefinition>(presets.map((p) => [p.id, p]));

/**
 * Find a preset by ID.  Returns `undefined` for unknown IDs.
 */
export function findPreset(id: string): PresetDefinition | undefined {
  return PRESET_MAP.get(id as PresetId);
}

/**
 * List all preset IDs in canonical order.
 */
export function listPresetIds(): readonly PresetId[] {
  return presetIds;
}

/**
 * List all preset definitions.
 */
export function listPresets(): readonly PresetDefinition[] {
  return presets;
}

// ---------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------

/**
 * Expand a preset into its final app + capability lists.
 *
 * The result includes all transitive dependencies resolved through the
 * catalog, sorted for determinism.
 */
export function expandPreset(presetId: PresetId): {
  apps: AppId[];
  capabilities: CapabilityId[];
} {
  const preset = findPreset(presetId);
  if (!preset) {
    throw new Error(`Unknown preset: ${presetId}`);
  }
  return expandDependencies(preset.apps, preset.capabilities);
}
