/**
 * Ordered replacement rule table — the single source of truth for every
 * literal rewrite performed by `nrb reconfigure` and `nrb init`.
 *
 * Order matters and is enforced by construction:
 *  1. Longest / most-specific literals first (global property: descending source length)
 *  2. Aliases before imports (structured definitions before use sites)
 *  3. App names before family fragments (admin-app-api before admin-app)
 *  4. Domains last within the identity family (per-app hostnames → apex → bare root)
 *  5. Ports as anchored context rules, never bare numbers
 *  6. compose / helm / k8s / CI / docs last (they embed every upstream name)
 *  7. Structured JSON/YAML key updates where the format allows (not blind text)
 *
 * The table is data-driven and unit-tested per rule family.
 */

import type { NrbConfig } from '../setup/schema.js';
import { buildIdentityReplacements, type IdentityReplacement } from './identity-targets.js';

// ---------------------------------------------------------------------------
// Family priority — lower number = earlier family in the ordered table.
// Within a family, rules are sorted by descending `from` length.
// This encodes §3.3 ordering without relying on insertion order.
// ---------------------------------------------------------------------------

const FAMILY_ORDER: Record<string, number> = {
  // Identity — longest compound forms first
  'slug-api': 0,
  appTitle: 1,
  className: 2,
  slug: 3,
  packageName: 4,
  dbName: 5,
  // Brand — full image refs before bare prefix, Host cookie before dev cookie
  helmChart: 10,
  helmRelease: 11,
  s3Bucket: 12,
  natsClientName: 13,
  redisKeyPrefix: 14,
  imagePrefix: 15,
  imageTag: 16,
  cliBin: 17,
  stateDir: 18,
  envPrefix: 19,
  // Scopes / aliases — definitions before use sites (handled as text here; structured edits are separate)
  aliasPrefix: 20,
  toolingScope: 21,
  owner: 22,
  // Domains — per-app hostnames first, bare root last (apex selection is a separate pass)
  domain: 30,
  apexApp: 31,
  // Runtime — anchored port rules (family 40+)
  port: 40,
  containerPort: 41,
  // Session
  session: 50,
  // Tenant / seed
  tenant: 60,
  // App renames (full project-name tokens, longest first)
  appRename: 70,
};

function familyPriority(label: string): number {
  return FAMILY_ORDER[label] ?? 99;
}

// ---------------------------------------------------------------------------
// Helpers — build anchored port/session/tenant/appRename replacements
// ---------------------------------------------------------------------------

export interface AnchoredReplacement {
  from: string;
  to: string;
  label: string;
  /** Human-readable family for audit output. */
  family: string;
  /** Regex that must match for the replacement to apply (anchored context). */
  anchor?: RegExp;
}

function buildPortReplacements(previous: NrbConfig['runtime'], next: NrbConfig['runtime']): AnchoredReplacement[] {
  const out: AnchoredReplacement[] = [];
  const prevPorts = previous.ports as Record<string, number>;
  const nextPorts = next.ports as Record<string, number>;
  const allKeys = new Set([...Object.keys(prevPorts), ...Object.keys(nextPorts)]);
  for (const key of allKeys) {
    const prev = prevPorts[key];
    const nextVal = nextPorts[key];
    if (prev !== undefined && nextVal !== undefined && prev !== nextVal) {
      const prevStr = String(prev);
      const nextStr = String(nextVal);
      // Anchored: only replace when the port appears in a known context.
      // We emit one generic text rule (sorted longest-first handles it) plus
      // the anchor is documented for the audit. The engine applies the
      // replacement via regex that matches the anchored contexts.
      out.push({
        from: prevStr,
        to: nextStr,
        label: `port:${key}`,
        family: 'port',
        // Matches: VAR=PORT, port: PORT, "PORT:80", fallback || PORT, etc.
        anchor: new RegExp(`(?:_PORT\\s*=\\s*|port:\\s*|:\\s*|\\|\\|\\s*)${prevStr}\\b`, 'u'),
      });
    }
  }
  if (previous.containerPort !== next.containerPort) {
    out.push({
      from: String(previous.containerPort),
      to: String(next.containerPort),
      label: 'containerPort',
      family: 'port',
    });
  }
  if (previous.stagingOffset !== next.stagingOffset) {
    out.push({
      from: String(previous.stagingOffset),
      to: String(next.stagingOffset),
      label: 'stagingOffset',
      family: 'port',
    });
  }
  return out;
}

function buildSessionReplacements(previous: NrbConfig['session'], next: NrbConfig['session']): IdentityReplacement[] {
  const out: IdentityReplacement[] = [];
  const add = (from: string, to: string, label: string) => {
    if (from !== to && from.length > 0) out.push({ from, to, label });
  };
  // Host cookie before dev cookie — longest first will also enforce this, but be explicit
  add(previous.cookieNameProd, next.cookieNameProd, 'session:cookieNameProd');
  add(previous.cookieNameDev, next.cookieNameDev, 'session:cookieNameDev');
  add(String(previous.maxAgeSeconds), String(next.maxAgeSeconds), 'session:maxAgeSeconds');
  add(previous.sameSite, next.sameSite, 'session:sameSite');
  return out;
}

function buildTenantReplacements(previous: NrbConfig['tenant'], next: NrbConfig['tenant']): IdentityReplacement[] {
  const out: IdentityReplacement[] = [];
  const add = (from: string, to: string, label: string) => {
    if (from !== to && from.length > 0) out.push({ from, to, label });
  };
  add(previous.defaultTenantId, next.defaultTenantId, 'tenant:defaultTenantId');
  add(previous.seed.admin.email, next.seed.admin.email, 'tenant:seed:admin:email');
  add(previous.seed.admin.name, next.seed.admin.name, 'tenant:seed:admin:name');
  // Passwords are secrets — still rewrite in seed files and examples
  add(previous.seed.admin.password, next.seed.admin.password, 'tenant:seed:admin:password');
  const maxUsers = Math.max(previous.seed.users.length, next.seed.users.length);
  for (let i = 0; i < maxUsers; i++) {
    const p = previous.seed.users[i];
    const n = next.seed.users[i];
    if (p && n) {
      add(p.email, n.email, `tenant:seed:users[${i}]:email`);
      add(p.name, n.name, `tenant:seed:users[${i}]:name`);
      add(p.password, n.password, `tenant:seed:users[${i}]:password`);
    } else if (p && !n) {
      // Removal — no replacement, file will be regenerated
    } else if (!p && n) {
      // Addition — no replacement
    }
  }
  return out;
}

function buildAppRenameReplacements(
  previous: Record<string, string>,
  next: Record<string, string>,
): IdentityReplacement[] {
  const out: IdentityReplacement[] = [];
  const allFrom = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const from of allFrom) {
    const prevTo = previous[from];
    const nextTo = next[from];
    if (prevTo !== undefined && nextTo !== undefined && prevTo !== nextTo) {
      // The literal to rewrite is the *previous* project name; the target is the new name.
      // For files that contain the project name as a literal (compose service, bake target, etc.)
      out.push({ from: prevTo, to: nextTo, label: `appRename:${from}` });
      // Also handle the key itself if it appears as a literal (e.g., in docs)
      if (from !== prevTo) {
        out.push({ from, to: nextTo, label: `appRename:${from}:key` });
      }
    } else if (prevTo === undefined && nextTo !== undefined) {
      // New rename added — rewrite the original app id to the new name
      out.push({ from, to: nextTo, label: `appRename:${from}` });
    }
  }
  // Sort longest first so admin-app-api rewrites before admin-app
  out.sort((a, b) => b.from.length - a.from.length);
  return out;
}

function buildRuntimeCredentialReplacements(
  previous: NrbConfig['runtime'],
  next: NrbConfig['runtime'],
): IdentityReplacement[] {
  const out: IdentityReplacement[] = [];
  const add = (from: string, to: string, label: string) => {
    if (from !== to && from.length > 0) out.push({ from, to, label });
  };
  add(previous.postgres.user, next.postgres.user, 'runtime:postgres:user');
  add(previous.postgres.password, next.postgres.password, 'runtime:postgres:password');
  add(previous.minio.accessKey, next.minio.accessKey, 'runtime:minio:accessKey');
  add(previous.minio.secretKey, next.minio.secretKey, 'runtime:minio:secretKey');
  add(previous.localSecrets.session, next.localSecrets.session, 'runtime:localSecrets:session');
  add(previous.localSecrets.betterAuth, next.localSecrets.betterAuth, 'runtime:localSecrets:betterAuth');
  add(previous.localSecrets.discordCustomId, next.localSecrets.discordCustomId, 'runtime:localSecrets:discordCustomId');
  return out;
}

// ---------------------------------------------------------------------------
// Public — build the full ordered replacement table from two configs
// ---------------------------------------------------------------------------

export function buildOrderedReplacements(previous: NrbConfig, next: NrbConfig): IdentityReplacement[] {
  const all: IdentityReplacement[] = [];

  // Identity (includes brand + derived slug-api) — longest-first within this family
  all.push(...buildIdentityReplacements(previous.identity, next.identity));

  // Runtime credentials (postgres/minio/localSecrets)
  all.push(...buildRuntimeCredentialReplacements(previous.runtime, next.runtime));

  // Session
  all.push(...buildSessionReplacements(previous.session, next.session));

  // Tenant (guarded elsewhere — still emitted so the engine can refuse with a clear message)
  all.push(...buildTenantReplacements(previous.tenant, next.tenant));

  // App renames — full project-name tokens, longest first
  all.push(...buildAppRenameReplacements(previous.appRenames ?? {}, next.appRenames ?? {}));

  // Deployment — publicDomain / imageRegistry / primaryApp
  if (previous.deployment.publicDomain !== next.deployment.publicDomain) {
    all.push({
      from: previous.deployment.publicDomain,
      to: next.deployment.publicDomain,
      label: 'deployment:publicDomain',
    });
  }
  if (previous.deployment.imageRegistry !== next.deployment.imageRegistry) {
    all.push({
      from: previous.deployment.imageRegistry,
      to: next.deployment.imageRegistry,
      label: 'deployment:imageRegistry',
    });
  }
  if ((previous.deployment.primaryApp ?? '') !== (next.deployment.primaryApp ?? '')) {
    all.push({
      from: previous.deployment.primaryApp ?? '',
      to: next.deployment.primaryApp ?? '',
      label: 'deployment:primaryApp',
    });
  }

  // Deduplicate by from→to (keep first occurrence) and sort longest-first globally
  const seen = new Set<string>();
  const deduped: IdentityReplacement[] = [];
  for (const r of all) {
    const key = `${r.from}\0${r.to}`;
    if (!seen.has(key) && r.from.length > 0) {
      seen.add(key);
      deduped.push(r);
    }
  }

  // Global longest-first sort, tie-broken by family priority
  deduped.sort((a, b) => {
    const lenDiff = b.from.length - a.from.length;
    if (lenDiff !== 0) return lenDiff;
    return familyPriority(a.label) - familyPriority(b.label);
  });

  return deduped;
}

// ---------------------------------------------------------------------------
// Port helpers — anchored replacements (applied via regex in the engine)
// ---------------------------------------------------------------------------

export function buildAnchoredPortReplacements(
  previous: NrbConfig['runtime'],
  next: NrbConfig['runtime'],
): AnchoredReplacement[] {
  return buildPortReplacements(previous, next);
}

// ---------------------------------------------------------------------------
// Apex host selection — same logic as init-project, extracted for reuse
// ---------------------------------------------------------------------------

export function applyApexHostSelection(
  content: string,
  previous: NrbConfig['identity'],
  next: NrbConfig['identity'],
): string {
  // Only when apexApp changes from landing-app to site-app (or vice versa)
  const prevApex = previous.apexApp ?? 'landing-app';
  const nextApex = next.apexApp ?? 'landing-app';
  if (prevApex === nextApex) return content;
  if (nextApex === 'landing-app') return content;

  const domain = next.domain;
  const marker = '__NRB_SELECTED_SITE_APEX__';
  const siteHostname = `site-app.${domain}`;
  const landingHostname = `landing-app.${domain}`;
  const escapedDomain = domain.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return content
    .replace(/^PRIMARY_APP=landing-app$/gmu, 'PRIMARY_APP=site-app')
    .split(siteHostname)
    .join(marker)
    .replace(new RegExp(`(?<![@\\w.-])${escapedDomain}(?![\\w.-])`, 'gu'), landingHostname)
    .split(marker)
    .join(domain);
}

// ---------------------------------------------------------------------------
// Defaults for testing — previous = template defaults
// ---------------------------------------------------------------------------
