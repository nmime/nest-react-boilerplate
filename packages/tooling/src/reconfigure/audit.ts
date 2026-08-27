import type { FilesystemAdapter } from '../setup/adapters/filesystem.ts';
import type { NrbConfig } from '../setup/schema.ts';
import { portDefinitions, portOrder, renderPortsDocument } from './ports.ts';

export interface AuditViolation {
  file: string;
  rule: string;
  repair: string;
}

export interface ReconfigureAuditResult {
  ok: boolean;
  violations: AuditViolation[];
  report: string;
}

type ReadFile = (path: string) => Promise<string>;

interface AuditContents {
  compose: string;
  composeEntries: readonly (readonly [string, string])[];
  dockerfile: string;
  fullstack: string;
  helmContent: string;
  helmEntries: readonly (readonly [string, string])[];
  pm2: string;
  proxy: string;
  proxyEntries: readonly (readonly [string, string])[];
  smoke: string;
}

export async function auditWorkspace(fs: FilesystemAdapter, config: NrbConfig): Promise<ReconfigureAuditResult> {
  const violations: AuditViolation[] = [];
  const read: ReadFile = async (path) => (await fs.read(path)) ?? '';
  const contents = await readAuditContents(read);

  await auditGeneratedPorts(read, config, violations);
  await auditRuntimePorts(read, config, contents, violations);
  auditContainerPort(config, contents, violations);
  auditSmokePorts(contents, violations);
  await auditProjects(fs, config, contents.helmContent, read, violations);
  await auditTsconfigPaths(fs, read, violations);

  const report = violations.length
    ? violations.map((violation) => `${violation.file}: ${violation.rule}; repair: ${violation.repair}`).join('\n')
    : 'Reconfigure audit clean.';
  return { ok: violations.length === 0, violations, report };
}

async function readAuditContents(read: ReadFile): Promise<AuditContents> {
  const composePaths = [
    'docker-compose.yml',
    'docker-compose.override.yml',
    'docker/docker-compose.yml',
    'docker/docker-compose.prod.yml',
    'docker/docker-compose.prod.bundled-db.yml',
    'docker/docker-compose.prod.external-db.yml',
    'docker/docker-compose.prod.mongodb-bundled-db.yml',
    'docker/docker-compose.prod.mongodb-external-db.yml',
    'docker/docker-compose.prod.redis.yml',
  ] as const;
  const helmPaths = ['.helm/values.yaml', '.helm/values-production.yaml', '.helm/values-selection.yaml'] as const;
  const proxyPaths = [
    'docker/nginx-fullstack.conf',
    'docker/nginx-spa.conf',
    'docker/caddy/Caddyfile.per-app-domains',
    'docker/caddy/Caddyfile.single-domain',
    '.nrb/Caddyfile.per-app-domains',
    '.nrb/Caddyfile.single-domain',
    'docker/caddy/routes/core/admin.caddy',
    'docker/caddy/routes/core/auth.caddy',
    'docker/caddy/routes/core/user.caddy',
    'docker/caddy/routes/optional/discord.caddy',
    'docker/caddy/routes/optional/telegram.caddy',
  ] as const;
  const [composeEntries, dockerfile, fullstack, helmEntries, pm2, proxyEntries, smoke] = await Promise.all([
    Promise.all(composePaths.map(async (path) => [path, await read(path)] as const)),
    read('Dockerfile'),
    read('apps/e2e/fullstack/src/compose.ts'),
    Promise.all(helmPaths.map(async (path) => [path, await read(path)] as const)),
    read('ecosystem.config.cjs'),
    Promise.all(proxyPaths.map(async (path) => [path, await read(path)] as const)),
    read('packages/tooling/src/commands/docker/smoke.ts'),
  ]);
  return {
    compose: composeEntries.map(([, content]) => content).join('\n'),
    composeEntries,
    dockerfile,
    fullstack,
    helmContent: helmEntries.map(([, content]) => content).join('\n'),
    helmEntries,
    pm2,
    proxy: proxyEntries.map(([, content]) => content).join('\n'),
    proxyEntries,
    smoke,
  };
}

async function auditGeneratedPorts(read: ReadFile, config: NrbConfig, violations: AuditViolation[]): Promise<void> {
  if ((await read('docs/PORTS.md')) !== (await renderPortsDocument(config))) {
    violations.push({ file: 'docs/PORTS.md', rule: 'generated-ports', repair: 'run nrb reconfigure' });
  }
}

async function auditRuntimePorts(
  read: ReadFile,
  config: NrbConfig,
  contents: AuditContents,
  violations: AuditViolation[],
): Promise<void> {
  const backendMainPaths: Partial<Record<(typeof portOrder)[number], string>> = {
    'admin-app-api': 'apps/backend/admin/admin-app-api/src/main.ts',
    'user-app-api': 'apps/backend/user/user-app-api/src/main.ts',
    'auth-app-api': 'apps/backend/auth/auth-app-api/src/main.ts',
    'discord-app-api': 'apps/backend/discord/discord-app-api/src/main.ts',
    'telegram-bot-api': 'apps/backend/telegram/telegram-bot-api/src/main.ts',
  };
  const backendMainEntries = await Promise.all(
    Object.entries(backendMainPaths).map(async ([name, path]) => [name, path, await read(path)] as const),
  );
  const backendMainContent = new Map(backendMainEntries.map(([name, path, content]) => [name, { path, content }]));

  for (const name of portOrder) {
    auditRuntimePort(name, config, contents, backendMainContent, violations);
  }

  const frontendConfigs: Record<string, { path: string; needle: string }> = {
    'admin-app': { path: 'apps/frontend/admin/vite.config.mts', needle: `port: ${config.runtime.ports['admin-app']}` },
    'user-app': { path: 'apps/frontend/app/vite.config.mts', needle: `port: ${config.runtime.ports['user-app']}` },
    'landing-app': {
      path: 'apps/frontend/landing/vite.config.mts',
      needle: `port: ${config.runtime.ports['landing-app']}`,
    },
    'site-app': { path: 'ecosystem.config.cjs', needle: `'SITE_APP_PORT', ${config.runtime.ports['site-app']}` },
    'mobile-app': {
      path: 'apps/frontend/mobile/project.json',
      needle: String(config.runtime.ports['mobile-app']),
    },
  };
  const frontendEntries = await Promise.all(
    Object.entries(frontendConfigs).map(async ([name, target]) => [name, target, await read(target.path)] as const),
  );
  for (const [name, target, content] of frontendEntries) {
    if (!content.includes(target.needle)) {
      violations.push({ file: target.path, rule: `runtime-port:${name}`, repair: `use ${target.needle}` });
    }
  }

  for (const [path, content] of contents.helmEntries) {
    if (content.includes('listenPort:') && !content.includes(`listenPort: ${config.runtime.ports.edge}`)) {
      violations.push({ file: path, rule: 'edge-port', repair: `use ${config.runtime.ports.edge}` });
    }
  }
}

function auditRuntimePort(
  name: (typeof portOrder)[number],
  config: NrbConfig,
  contents: AuditContents,
  backendMainContent: ReadonlyMap<string, { path: string; content: string }>,
  violations: AuditViolation[],
): void {
  const port = config.runtime.ports[name];
  const environment = portDefinitions[name].environment;
  const composeNeedle = `\${${environment}:-${port}}`;
  for (const [path, content] of contents.composeEntries) {
    if (content.includes(`${environment}:-`) && !content.includes(composeNeedle)) {
      violations.push({ file: path, rule: `port:${name}`, repair: `use ${environment}:-${port}` });
    }
  }
  if ((name.endsWith('-api') || name === 'site-app') && !contents.pm2.includes(`'${environment}', ${port}`)) {
    violations.push({ file: 'ecosystem.config.cjs', rule: `port:${name}`, repair: `set ${environment}=${port}` });
  }
  const appMain = backendMainContent.get(name);
  if (appMain && !appMain.content.includes(`port: ${port}`)) {
    violations.push({ file: appMain.path, rule: `runtime-port:${name}`, repair: `set port: ${port}` });
  }
}

function auditContainerPort(config: NrbConfig, contents: AuditContents, violations: AuditViolation[]): void {
  const port = config.runtime.containerPort;
  if (!contents.dockerfile.includes(`PORT=${port}`)) {
    violations.push({ file: 'Dockerfile', rule: 'container-port', repair: `use container port ${port}` });
  }
  for (const [path, content] of contents.composeEntries) {
    if (/^\s*PORT:\s*\d+/mu.test(content) && !content.includes(`PORT: ${port}`)) {
      violations.push({ file: path, rule: 'container-port', repair: `use container port ${port}` });
    }
  }
  for (const [path, content] of contents.proxyEntries) {
    const targets = [
      ...content.matchAll(/(?:proxy_pass http:\/\/|reverse_proxy |import api_service )[a-z][a-z0-9-]*:(\d+)/gu),
    ].map((match) => Number(match[1]));
    if (targets.length > 0 && targets.some((target) => target !== port)) {
      violations.push({ file: path, rule: 'container-port', repair: `use container port ${port}` });
    }
  }
  const primaryHelm = contents.helmEntries.find(([path]) => path === '.helm/values.yaml')?.[1] ?? '';
  for (const key of ['port', 'servicePort'] as const) {
    if (!primaryHelm.includes(`${key}: ${port}`)) {
      violations.push({ file: '.helm/values.yaml', rule: `container-${key}`, repair: `use ${key}: ${port}` });
    }
  }
}

function auditSmokePorts(contents: AuditContents, violations: AuditViolation[]): void {
  const environments = [
    'ADMIN_APP_API_PORT',
    'USER_APP_API_PORT',
    'AUTH_APP_API_PORT',
    'ADMIN_APP_PORT',
    'USER_APP_PORT',
    'LANDING_APP_PORT',
    'SITE_APP_PORT',
    'MOBILE_APP_PORT',
  ] as const;
  for (const environment of environments) {
    if (!contents.smoke.includes(`pickPort("${environment}",`)) {
      violations.push({
        file: 'packages/tooling/src/commands/docker/smoke.ts',
        rule: `smoke-port:${environment}`,
        repair: `derive ${environment} through pickPort`,
      });
    }
    if (environment !== 'MOBILE_APP_PORT' && !contents.fullstack.includes(`pickPort('${environment}',`)) {
      violations.push({
        file: 'apps/e2e/fullstack/src/compose.ts',
        rule: `fullstack-port:${environment}`,
        repair: `derive ${environment} through pickPort`,
      });
    }
  }
}

async function auditProjects(
  fs: FilesystemAdapter,
  config: NrbConfig,
  helmContent: string,
  read: ReadFile,
  violations: AuditViolation[],
): Promise<void> {
  const projectPaths = (await fs.list()).filter((path) => path.endsWith('/project.json'));
  const projectFiles = await Promise.all(
    projectPaths.map(async (path) => JSON.parse((await fs.read(path)) ?? '{}') as unknown),
  );
  const projects = new Set<string>();
  for (const raw of projectFiles) {
    if (isNamedProject(raw)) {
      projects.add(raw.name);
    }
  }
  const bake = JSON.parse(await read('docker-bake.json')) as { target?: Record<string, unknown> };
  for (const source of config.apps) {
    const app = config.appRenames[source] ?? source;
    if (!projects.has(app)) {
      violations.push({ file: 'project.json', rule: `project:${app}`, repair: `define ${app}` });
    }
    if (app !== 'fullstack-e2e' && !bake.target?.[app]) {
      violations.push({ file: 'docker-bake.json', rule: `target:${app}`, repair: `define ${app}` });
    }
    if (app !== 'fullstack-e2e' && !helmContent.includes(`appId: ${app}`)) {
      violations.push({ file: '.helm/values.yaml', rule: `app:${app}`, repair: `define ${app}` });
    }
  }
}

async function auditTsconfigPaths(fs: FilesystemAdapter, read: ReadFile, violations: AuditViolation[]): Promise<void> {
  const paths =
    (JSON.parse(await read('tsconfig.base.json')) as { compilerOptions?: { paths?: Record<string, string[]> } })
      .compilerOptions?.paths ?? {};
  const listedPaths = await fs.list();
  const directTargets = await Promise.all(
    Object.values(paths)
      .flat()
      .map((target) => target.replace(/\/\*$/u, ''))
      .map(async (target) => [target, await fs.read(target)] as const),
  );
  const directlyReadable = new Set(directTargets.filter(([, content]) => content !== null).map(([target]) => target));

  for (const [alias, targets] of Object.entries(paths)) {
    if (targets.length === 0) {
      violations.push({ file: 'tsconfig.base.json', rule: `path:${alias}`, repair: 'add target' });
      continue;
    }
    for (const target of targets) {
      const candidate = target.replace(/\/\*$/u, '');
      const targetExists = listedPaths.some((path) => path === candidate || path.startsWith(`${candidate}/`));
      if (!directlyReadable.has(candidate) && !targetExists) {
        violations.push({
          file: 'tsconfig.base.json',
          rule: `path-target:${alias}`,
          repair: `restore target ${target}`,
        });
      }
    }
  }
}

function isNamedProject(value: unknown): value is { name: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return typeof (value as { name?: unknown }).name === 'string';
}
