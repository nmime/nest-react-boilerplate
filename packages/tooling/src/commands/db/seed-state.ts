import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function recordSeedState(provider: 'postgres' | 'mongodb', workspaceRoot = process.cwd()): void {
  const path = resolve(workspaceRoot, '.nrb', 'seed-state.json');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ version: 1, provider, seeded: true }, null, 2)}\n`, 'utf8');
}
