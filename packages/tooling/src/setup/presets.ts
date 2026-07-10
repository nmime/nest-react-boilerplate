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
import type { AppId, CapabilityId, PresetId } from "./schema.js";
import { PRESET_IDS } from "./schema.js";
import { expandDependencies } from "./catalog.js";

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
 * Five canonical presets, ordered from minimal to enterprise.
 *
 * Arrays are source-sorted for readability; `expandPreset` returns
 * canonical (sorted + expanded) arrays.
 */
export const PRESETS: ReadonlyArray<Readonly<PresetDefinition>> = [
  /**
   * Minimal: a single API + auth.  Good for prototyping or library-style
   * backends.
   */
  {
    id: "minimal",
    description: "Single API with auth — minimal backend footprint",
    apps: ["auth-app-api", "user-app-api"],
    capabilities: ["postgres"],
  },

  /**
   * Starter: one frontend app + one backend + auth.  Good for MVP
   * applications.
   */
  {
    id: "starter",
    description: "One frontend + backend + auth — MVP-ready starter",
    apps: ["user-app", "user-app-api", "auth-app-api"],
    capabilities: ["postgres", "design-tokens", "i18n"],
  },

  /**
   * Fullstack: all core frontend + backend apps with standard capabilities.
   * The default for production-ready setups.
   */
  {
    id: "fullstack",
    description: "All core apps with standard capabilities — production-ready",
    apps: [
      "admin-app",
      "admin-app-api",
      "user-app",
      "user-app-api",
      "auth-app-api",
      "landing-app",
      "fullstack-e2e",
    ],
    capabilities: [
      "postgres",
      "redis",
      "design-tokens",
      "authz",
      "i18n",
      "otel",
      "swagger",
    ],
  },

  /**
   * Enterprise: every supported app and capability.  For organisations that
   * want the complete stack out of the box.
   */
  {
    id: "enterprise",
    description: "Every supported app and capability — complete stack",
    apps: [
      "admin-app",
      "admin-app-api",
      "user-app",
      "user-app-api",
      "auth-app-api",
      "landing-app",
      "site-app",
      "mobile-app",
      "discord-app-api",
      "telegram-bot-api",
      "telegram-bot-worker",
      "fullstack-e2e",
    ],
    capabilities: [
      "postgres",
      "redis",
      "s3",
      "nats",
      "otel",
      "swagger",
      "i18n",
      "analytics",
      "websockets",
      "feature-flags",
      "notifications",
      "design-tokens",
      "authz",
      "telegram-bot",
      "discord-bot",
    ],
  },

  /**
   * Bots: bot-focused setup with Telegram + Discord integrations.
   */
  {
    id: "bots",
    description: "Telegram + Discord bots with workers — bot-first setup",
    apps: [
      "auth-app-api",
      "user-app-api",
      "telegram-bot-api",
      "telegram-bot-worker",
      "discord-app-api",
    ],
    capabilities: [
      "postgres",
      "redis",
      "telegram-bot",
      "discord-bot",
      "otel",
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

const PRESET_MAP = new Map<PresetId, PresetDefinition>(
  PRESETS.map((p) => [p.id, p]),
);

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
  return PRESET_IDS;
}

/**
 * List all preset definitions.
 */
export function listPresets(): readonly PresetDefinition[] {
  return PRESETS;
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
