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
export async function auditWorkspace(fs: FilesystemAdapter, config: NrbConfig): Promise<ReconfigureAuditResult> {
  const violations: AuditViolation[] = [];
  const read = async (path: string) => (await fs.read(path)) ?? '';
  const compose = `${await read('docker/docker-compose.yml')}\n${await read('docker/docker-compose.prod.yml')}`;
  const helm = await read('.helm/values.yaml');
  const pm2 = await read('ecosystem.config.cjs');
  if ((await read('docs/PORTS.md')) !== (await renderPortsDocument(config)))
    violations.push({ file: 'docs/PORTS.md', rule: 'generated-ports', repair: 'run nrb reconfigure' });
  for (const name of portOrder) {
    const port = config.runtime.ports[name];
    const env = portDefinitions[name].environment;
    if (!['edge', 'loki', 'tempo'].includes(name) && !compose.includes(`\${${env}:-${port}}`))
      violations.push({ file: 'docker/docker-compose*.yml', rule: `port:${name}`, repair: `use ${env}:-${port}` });
    if ((name.endsWith('-api') || name === 'site-app') && !pm2.includes(`'${env}', ${port}`))
      violations.push({ file: 'ecosystem.config.cjs', rule: `port:${name}`, repair: `set ${env}=${port}` });
  }
  if (!helm.includes(`listenPort: ${config.runtime.ports.edge}`))
    violations.push({ file: '.helm/values.yaml', rule: 'edge-port', repair: `use ${config.runtime.ports.edge}` });
  const projects = new Set<string>();
  for (const path of await fs.list())
    if (path.endsWith('/project.json')) {
      const name = (JSON.parse((await fs.read(path)) ?? '{}') as { name?: string }).name;
      if (name) projects.add(name);
    }
  const bake = JSON.parse(await read('docker-bake.json')) as { target?: Record<string, unknown> };
  for (const source of config.apps) {
    const app = config.appRenames[source] ?? source;
    if (!projects.has(app)) violations.push({ file: 'project.json', rule: `project:${app}`, repair: `define ${app}` });
    if (app !== 'fullstack-e2e' && !bake.target?.[app])
      violations.push({ file: 'docker-bake.json', rule: `target:${app}`, repair: `define ${app}` });
    if (app !== 'fullstack-e2e' && !helm.includes(`appId: ${app}`))
      violations.push({ file: '.helm/values.yaml', rule: `app:${app}`, repair: `define ${app}` });
  }
  const paths =
    (JSON.parse(await read('tsconfig.base.json')) as { compilerOptions?: { paths?: Record<string, string[]> } })
      .compilerOptions?.paths ?? {};
  for (const [alias, targets] of Object.entries(paths))
    if (targets.length === 0)
      violations.push({ file: 'tsconfig.base.json', rule: `path:${alias}`, repair: 'add target' });
  const report = violations.length
    ? violations.map((v) => `${v.file}: ${v.rule}; repair: ${v.repair}`).join('\n')
    : 'Reconfigure audit clean.';
  return { ok: violations.length === 0, violations, report };
}
