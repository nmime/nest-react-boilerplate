#!/usr/bin/env node
// Evidence for: REQ-SCAFFOLD-INIT-004
/**
 * Fresh-scaffold identity entrypoint.
 *
 * The documented flags and JSON result remain compatible with the historical
 * init command. Identity is now validated as schema-v2 configuration, persisted
 * to nrb.config.json/.nrb/identity.json, and applied through the shared
 * reconfigure engine.
 */
import { readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';

import { createNodeFilesystem } from '../../setup/adapters/node-filesystem.js';
import {
  defaultDeploymentConfig,
  defaultIdentityConfig,
  parseNrbConfig,
  type NrbConfig,
} from '../../setup/schema.js';
import { emptyState } from '../../setup/state.js';
import { defaultIdentity } from '../../reconfigure/identity-targets.js';
import { assertCleanGitWorkspace, loadDesiredConfig, templateBase } from '../../reconfigure/io.js';
import { runReconfigure } from '../../reconfigure/run.js';

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.nx',
  'tmp',
  'playwright-report',
  'test-results',
]);
const TEXT_EXTENSIONS = new Set([
  '',
  '.caddy',
  '.cjs',
  '.conf',
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.mts',
  '.sh',
  '.tpl',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);

interface InitProjectArgs {
  config?: string;
  dryRun: boolean;
  force: boolean;
  nonInteractive: boolean;
  name?: string;
  packageName?: string;
  appSlug?: string;
  dbName?: string;
  domain?: string;
  apexApp?: string;
  owner?: string;
  help?: boolean;
}

interface InitConfig {
  appTitle: string;
  appSlug: string;
  packageName: string;
  dbName: string;
  className: string;
  domain: string;
  apexApp: 'landing-app' | 'site-app';
  owner: string;
}

export function parseArgs(argv: string[]): InitProjectArgs {
  const args: InitProjectArgs = { dryRun: false, force: false, nonInteractive: false };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    const readValue = () => {
      const next = argv[++i];
      if (!next) throw new Error(`${item} requires a value.`);
      return next;
    };
    if (item === '--dry-run') args.dryRun = true;
    else if (item === '--force') args.force = true;
    else if (item === '--non-interactive') args.nonInteractive = true;
    else if (item === '--config') args.config = readValue();
    else if (item.startsWith('--config=')) args.config = item.slice('--config='.length);
    else if (item === '--name') args.name = readValue();
    else if (item === '--package-name') args.packageName = readValue();
    else if (item === '--app-slug') args.appSlug = readValue();
    else if (item === '--db-name') args.dbName = readValue();
    else if (item === '--domain') args.domain = readValue();
    else if (item === '--apex-app') args.apexApp = readValue();
    else if (item === '--owner') args.owner = readValue();
    else if (item === '--help' || item === '-h') args.help = true;
    else if (item !== '--') throw new Error(`Unknown option: ${item}`);
  }
  return args;
}

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
const snake = (value: string) => slugify(value).replaceAll('-', '_');
const pascal = (value: string) =>
  slugify(value)
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
const title = (value: string) => value.trim().replace(/\s+/gu, ' ');

function buildIdentityArgs(args: InitProjectArgs, base?: NrbConfig): InitConfig {
  const name = args.name ?? base?.identity.name;
  const rawDomain = args.domain ?? base?.identity.domain;
  if (!name) throw new Error('--name is required in non-interactive mode.');
  if (!rawDomain) {
    throw new Error('--domain is required so every public app and API receives a product-owned hostname.');
  }
  const appTitle = title(name);
  const baseSlug = base?.identity.slug === defaultIdentityConfig.slug && args.name ? undefined : base?.identity.slug;
  const appSlug = args.appSlug ?? args.packageName ?? baseSlug ?? slugify(appTitle);
  const domain = normalizeDomain(rawDomain);
  const apexApp = args.apexApp ?? base?.identity.apexApp ?? 'landing-app';
  if (apexApp !== 'landing-app' && apexApp !== 'site-app') {
    throw new Error('--apex-app must be either "landing-app" or "site-app".');
  }
  return {
    appTitle,
    appSlug,
    packageName:
      args.packageName ??
      (base?.identity.packageName === defaultIdentityConfig.packageName && args.name
        ? appSlug
        : (base?.identity.packageName ?? appSlug)),
    dbName:
      args.dbName ??
      (base?.identity.dbName === defaultIdentityConfig.dbName && args.name
        ? snake(appTitle)
        : (base?.identity.dbName ?? snake(appTitle))),
    className: pascal(appTitle),
    domain,
    apexApp,
    owner: args.owner ?? base?.identity.owner ?? 'your-github-org',
  };
}

function buildDesiredConfig(args: InitProjectArgs, workspaceRoot: string): { desired: NrbConfig; output: InitConfig } {
  let base: NrbConfig;
  try {
    base = loadDesiredConfig(workspaceRoot, args.config);
  } catch (error) {
    if (args.config) throw error;
    base = parseNrbConfig({
      schemaVersion: '2.0.0',
      apps: [],
      capabilities: [],
      product: {},
      deployment: { ...defaultDeploymentConfig },
      options: {},
    });
  }
  const existingConfigIsImplicitTemplateDefaults = args.config === undefined && base.identity.slug === defaultIdentityConfig.slug;
  if (existingConfigIsImplicitTemplateDefaults && (!args.name || !args.domain)) {
    if (!args.name) throw new Error('--name is required in non-interactive mode.');
    throw new Error('--domain is required so every public app and API receives a product-owned hostname.');
  }
  const output = buildIdentityArgs(args, base);
  const desired = parseNrbConfig({
    ...base,
    identity: {
      ...base.identity,
      name: output.appTitle,
      slug: output.appSlug,
      packageName: output.packageName,
      dbName: output.dbName,
      className: output.className,
      domain: output.domain,
      apexApp: output.apexApp,
      owner: output.owner,
    },
    deployment: {
      ...base.deployment,
      publicDomain: output.domain,
      primaryApp: output.apexApp,
      imageRegistry:
        base.deployment.imageRegistry === defaultDeploymentConfig.imageRegistry ||
        base.deployment.imageRegistry === `ghcr.io/${defaultIdentityConfig.owner}/${defaultIdentityConfig.slug}`
          ? `ghcr.io/${output.owner}/${output.appSlug}`
          : base.deployment.imageRegistry,
    },
    options: {
      ...base.options,
      force: args.force,
      dryRun: args.dryRun,
      nonInteractive: args.nonInteractive,
    },
  });
  return { desired, output };
}

function normalizeDomain(value: string): string {
  const domain = value.trim().toLowerCase().replace(/\.$/u, '');
  const labels = domain.split('.');
  const isValidLabel = (label: string): boolean =>
    label.length >= 1 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label);
  if (domain.length > 253 || labels.length < 2 || labels.some((label) => !isValidLabel(label))) {
    throw new Error(
      `--domain must be a DNS base name without a protocol, port, path, or wildcard (received "${value}").`,
    );
  }
  return domain;
}

function listInitTargets(root: string): string[] {
  const targets: string[] = [];
  const walk = (directory: string) => {
    for (const name of readdirSync(directory)) {
      if (SKIP_DIRS.has(name)) continue;
      const path = join(directory, name);
      const stat = statSync(path);
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile()) {
        const environmentExample =
          name.endsWith('.example') &&
          (name.startsWith('.env.') || name.endsWith('.env.example') || name === '.env.example');
        if (name === '.env' || (name.startsWith('.env.') && !environmentExample)) continue;
        if (environmentExample || TEXT_EXTENSIONS.has(extname(path))) targets.push(relative(root, path));
      }
    }
  };
  walk(root);
  return targets.sort();
}

async function runInitProject(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  if (args.help) {
    printUsage();
    return;
  }
  const workspaceRoot = process.cwd();
  assertCleanGitWorkspace(workspaceRoot, args.force || args.dryRun);
  const { desired, output } = buildDesiredConfig(args, workspaceRoot);
  const previous = {
    ...desired,
    identity: defaultIdentity(),
    deployment: {
      ...desired.deployment,
      publicDomain: defaultIdentityConfig.domain,
      primaryApp: defaultIdentityConfig.apexApp,
      imageRegistry: defaultDeploymentConfig.imageRegistry,
    },
  };
  const result = await runReconfigure({
    fs: createNodeFilesystem(workspaceRoot),
    desired,
    previous,
    manifest: null,
    state: emptyState,
    templateBase: templateBase(workspaceRoot),
    dryRun: args.dryRun,
    force: args.force,
    targetPaths: listInitTargets(workspaceRoot),
  });
  if (result.status === 'conflict' || result.status === 'rolled-back') {
    throw new Error(result.error ?? `Refused tracked files: ${result.conflicts.map((item) => item.path).join(', ')}`);
  }
  printResult(args, output, result.plan.files);
}

function printResult(args: InitProjectArgs, config: InitConfig, files: string[]): void {
  console.log(
    JSON.stringify(
      {
        status: args.dryRun ? 'dry-run' : 'updated',
        config,
        filesChanged: files.length,
        files: files.slice(0, 50),
      },
      null,
      2,
    ),
  );
}

function printUsage(): void {
  console.log(`Usage: pnpm nrb init --name "Acme App" --domain acme.example [options]

Required without --config:
  --name <title>       Product display name.
  --domain <base>      Product-owned DNS base without protocol/path/wildcard.

Options:
  --config <path>      Merge flags into this schema-v2 JSON config.
  --package-name <id>  Root package name (defaults to slugified title).
  --app-slug <id>      Application slug (defaults to package name/title).
  --db-name <name>     PostgreSQL database name (defaults to snake_case title).
  --owner <org>        GitHub/GitLab owner replacing your-github-org.
  --apex-app <id>      Public apex owner: landing-app (default) or site-app.
  --dry-run            Print the historical file plan without writing.
  --force              Allow a dirty or non-Git workspace and overwrite conflicts.
  --non-interactive    Compatibility flag; required values must still be supplied.

Compatibility alias: pnpm init:project -- --name ... --domain ...`);
}

runInitProject(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
