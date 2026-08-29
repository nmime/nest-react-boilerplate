// @requirements REQ-SCAFFOLD-TOOLING-005
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { FilesystemAdapter } from '../setup/adapters/filesystem.js';
import { parseNrbConfig } from '../setup/schema.js';
import { auditWorkspace } from './audit.js';
import { portDefinitions, portOrder, renderPortsDocument } from './ports.js';

function auditFilesystem(overrides: Record<string, string> = {}): FilesystemAdapter {
  const config = parseNrbConfig({ schemaVersion: '2.0.0' });
  const appMain = (port: number) => `bootstrap({ port: ${port} });\n`;
  const frontend = (port: number) => `export default { server: { port: ${port} } };\n`;
  const compose = portOrder
    .map((name) => `- "\${${portDefinitions[name].environment}:-${config.runtime.ports[name]}}:1"`)
    .join('\n');
  const files = new Map<string, string>(
    Object.entries({
      'docs/PORTS.md': '',
      'docker-compose.yml': compose,
      'docker-compose.override.yml': '',
      'docker/docker-compose.yml': `${compose}\nPORT: 80\n`,
      'docker/docker-compose.prod.yml': `${compose}\nPORT: 80\n`,
      'docker/docker-compose.prod.bundled-db.yml': '',
      'docker/docker-compose.prod.external-db.yml': '',
      'docker/docker-compose.prod.mongodb-bundled-db.yml': '',
      'docker/docker-compose.prod.mongodb-external-db.yml': '',
      'docker/docker-compose.prod.redis.yml': '',
      Dockerfile: 'ENV PORT=80\n',
      'apps/e2e/fullstack/src/compose.ts': [
        "pickPort('ADMIN_APP_API_PORT', 1)",
        "pickPort('USER_APP_API_PORT', 2)",
        "pickPort('AUTH_APP_API_PORT', 3)",
        "pickPort('ADMIN_APP_PORT', 81)",
        "pickPort('USER_APP_PORT', 82)",
        "pickPort('LANDING_APP_PORT', 83)",
        "pickPort('SITE_APP_PORT', 84)",
      ].join('\n'),
      '.helm/values.yaml': 'edge:\n  listenPort: 8080\napp:\n  port: 80\n  servicePort: 80\n',
      '.helm/values-production.yaml': 'edge:\n  listenPort: 8080\n',
      '.helm/values-selection.yaml': '',
      'ecosystem.config.cjs': portOrder
        .filter((name) => name.endsWith('-api') || name === 'site-app')
        .map((name) => `'${portDefinitions[name].environment}', ${config.runtime.ports[name]}`)
        .join('\n'),
      'docker/nginx-fullstack.conf': 'proxy_pass http://auth-app-api:80;\n',
      'docker/nginx-spa.conf': '',
      'docker/caddy/Caddyfile.per-app-domains': 'import api_service auth-app-api:80\n',
      'docker/caddy/Caddyfile.single-domain': 'reverse_proxy auth-app-api:80\n',
      '.nrb/Caddyfile.per-app-domains': 'import api_service auth-app-api:80\n',
      '.nrb/Caddyfile.single-domain': 'reverse_proxy auth-app-api:80\n',
      'docker/caddy/routes/core/admin.caddy': 'reverse_proxy admin-app-api:80\n',
      'docker/caddy/routes/core/auth.caddy': 'reverse_proxy auth-app-api:80\n',
      'docker/caddy/routes/core/user.caddy': 'reverse_proxy user-app-api:80\n',
      'docker/caddy/routes/optional/discord.caddy': 'reverse_proxy discord-app-api:80\n',
      'docker/caddy/routes/optional/telegram.caddy': 'reverse_proxy telegram-bot-api:80\n',
      'packages/tooling/src/commands/docker/smoke.ts': [
        'ADMIN_APP_API_PORT',
        'USER_APP_API_PORT',
        'AUTH_APP_API_PORT',
        'ADMIN_APP_PORT',
        'USER_APP_PORT',
        'LANDING_APP_PORT',
        'SITE_APP_PORT',
        'MOBILE_APP_PORT',
      ]
        .map((name) => `pickPort("${name}", 1)`)
        .join('\n'),
      'apps/backend/admin/admin-app-api/src/main.ts': appMain(3001),
      'apps/backend/user/user-app-api/src/main.ts': appMain(3002),
      'apps/backend/auth/auth-app-api/src/main.ts': appMain(3003),
      'apps/backend/discord/discord-app-api/src/main.ts': appMain(3007),
      'apps/backend/telegram/telegram-bot-api/src/main.ts': appMain(3013),
      'apps/frontend/admin/vite.config.mts': frontend(4200),
      'apps/frontend/app/vite.config.mts': frontend(4201),
      'apps/frontend/landing/vite.config.mts': frontend(4202),
      'apps/frontend/mobile/project.json': '{"name":"mobile-app","serve":{"port":4300}}\n',
      'docker-bake.json': '{"target":{}}\n',
      'tsconfig.base.json': '{"compilerOptions":{"paths":{}}}\n',
      ...overrides,
    }),
  );
  void renderPortsDocument(config).then((content) => files.set('docs/PORTS.md', content));
  return {
    async read(path) {
      if (path === 'docs/PORTS.md' && files.get(path) === '') files.set(path, await renderPortsDocument(config));
      return files.get(path) ?? null;
    },
    async write(path, content) {
      files.set(path, content);
    },
    async delete(path) {
      files.delete(path);
    },
    async exists(path) {
      return files.has(path);
    },
    async list() {
      return [...files.keys()];
    },
  };
}

describe('reconfigure audit', () => {
  it('reports the exact compose file when one stale value is masked by another correct file', async () => {
    const config = parseNrbConfig({ schemaVersion: '2.0.0' });
    const stale = "ports:\n  - '${ADMIN_APP_API_PORT:-3999}:80'\n";
    const result = await auditWorkspace(auditFilesystem({ 'docker/docker-compose.prod.yml': stale }), config);
    assert.equal(result.ok, false);
    assert.ok(
      result.violations.some(
        ({ file, rule }) => file === 'docker/docker-compose.prod.yml' && rule === 'port:admin-app-api',
      ),
    );
  });

  it('reports the exact proxy file when another proxy still has the desired container port', async () => {
    const config = parseNrbConfig({ schemaVersion: '2.0.0' });
    const result = await auditWorkspace(
      auditFilesystem({ 'docker/caddy/routes/core/auth.caddy': 'reverse_proxy auth-app-api:8088\n' }),
      config,
    );
    assert.equal(result.ok, false);
    assert.ok(
      result.violations.some(
        ({ file, rule }) => file === 'docker/caddy/routes/core/auth.caddy' && rule === 'container-port',
      ),
    );
  });
});
