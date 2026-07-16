#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseGeneratedEnvironment } from '../../setup/environment.js';
import { run } from './runtime.js';

const workspaceRoot = process.cwd();
const environmentPath = resolve(workspaceRoot, '.nrb/capabilities.env');
const composePath = resolve(workspaceRoot, 'docker/docker-compose.yml');

if (!existsSync(environmentPath)) {
  console.error('No setup selection found. Run `pnpm nrb setup` before `pnpm run docker:selected`.');
  process.exit(1);
}
if (!existsSync(composePath)) {
  console.error(`Compose file not found: ${composePath}`);
  process.exit(1);
}

const selectedEnvironment = parseGeneratedEnvironment(readFileSync(environmentPath, 'utf8'));
if (!selectedEnvironment['COMPOSE_PROFILES']) {
  console.error('The setup selection has no Compose profiles. Select at least one runnable app or service.');
  process.exit(1);
}

const composeArgs = process.argv.slice(2);
await run(
  'docker',
  ['compose', '--env-file', environmentPath, '-f', composePath, ...(composeArgs.length > 0 ? composeArgs : ['up', '--build'])],
  {
    cwd: workspaceRoot,
    env: { ...process.env, ...selectedEnvironment },
    stdio: 'inherit',
  },
).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
