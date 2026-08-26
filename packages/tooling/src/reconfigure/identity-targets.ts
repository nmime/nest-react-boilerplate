/**
 * Identity-driven file reconfiguration.
 *
 * When a product changes its identity values (slug, dbName, domain, etc.)
 * in nrb.config.json, the workspace files must be rewritten to reflect
 * the new literals. This module derives the replacement map from the
 * identity config and produces deterministic file operations.
 */

import type { NrbConfig } from '../setup/schema.js';
import { defaultIdentityConfig, defaultIdentityBrandConfig } from '../setup/schema.js';

export interface IdentityReplacement {
  from: string;
  to: string;
  label: string;
}

export function buildIdentityReplacements(
  previous: NrbConfig['identity'],
  next: NrbConfig['identity'],
): IdentityReplacement[] {
  const replacements: IdentityReplacement[] = [];
  const add = (from: string, to: string, label: string) => {
    if (from !== to && from.length > 0) {
      replacements.push({ from, to, label });
    }
  };

  add(previous.name, next.name, 'appTitle');
  add(previous.slug, next.slug, 'appSlug');
  add(previous.packageName, next.packageName, 'packageName');
  add(previous.dbName, next.dbName, 'dbName');
  add(previous.className, next.className, 'className');
  add(previous.owner, next.owner, 'owner');
  add(previous.domain, next.domain, 'domain');
  add(previous.aliasPrefix, next.aliasPrefix, 'aliasPrefix');
  add(previous.toolingScope, next.toolingScope, 'toolingScope');
  add(previous.apexApp ?? '', next.apexApp ?? '', 'apexApp');

  // Brand-level replacements
  add(previous.brand.cliBin, next.brand.cliBin, 'cliBin');
  add(previous.brand.stateDir, next.brand.stateDir, 'stateDir');
  add(previous.brand.envPrefix, next.brand.envPrefix, 'envPrefix');
  add(previous.brand.imagePrefix, next.brand.imagePrefix, 'imagePrefix');
  add(previous.brand.imageTag, next.brand.imageTag, 'imageTag');
  add(previous.brand.redisKeyPrefix, next.brand.redisKeyPrefix, 'redisKeyPrefix');
  add(previous.brand.helmChart, next.brand.helmChart, 'helmChart');
  add(previous.brand.helmRelease, next.brand.helmRelease, 'helmRelease');
  add(previous.brand.natsClientName, next.brand.natsClientName, 'natsClientName');
  add(previous.brand.s3Bucket, next.brand.s3Bucket, 's3Bucket');

  // Derived forms: slug-api and underscore variants appear in files
  if (previous.slug !== next.slug) {
    add(`${previous.slug}-api`, `${next.slug}-api`, 'slug-api');
  }
  return replacements;
}

export function applyIdentityReplacements(content: string, replacements: readonly IdentityReplacement[]): string {
  let result = content;
  for (const { from, to } of replacements) {
    result = result.split(from).join(to);
  }
  return result;
}

export function defaultIdentity(): NrbConfig['identity'] {
  return {
    ...defaultIdentityConfig,
    brand: { ...defaultIdentityBrandConfig },
  };
}
