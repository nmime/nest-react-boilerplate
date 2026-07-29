import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const normalizedClosureContextFiles = [
  'closure.json',
  'nrb.config.json',
  'workspace.json',
  'package.json',
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
  'lock.json',
];

export function validateNormalizedClosureContext(contextRoot) {
  const resolved = resolve(contextRoot);
  const missing = normalizedClosureContextFiles.filter((file) => !existsSync(join(resolved, file)));
  if (missing.length > 0) {
    throw new Error(`nrb-closure context is incomplete at ${resolved}: ${missing.join(', ')}`);
  }
  return resolved;
}

export function resolveSelectedProductClosureContext(workspaceRoot, configuredContext) {
  const expected = resolve(workspaceRoot, '.nrb/closure');
  if (configuredContext && resolve(workspaceRoot, configuredContext) !== expected) {
    throw new Error('Product source builds require the normalized selected context at .nrb/closure.');
  }
  validateNormalizedClosureContext(expected);
  for (const [source, normalized] of [
    ['.nrb/closure.json', 'closure.json'],
    ['nrb.config.json', 'nrb.config.json'],
    ['.nrb/workspace.json', 'workspace.json'],
  ]) {
    const sourcePath = join(workspaceRoot, source);
    if (
      !existsSync(sourcePath) ||
      readFileSync(sourcePath, 'utf8') !== readFileSync(join(expected, normalized), 'utf8')
    ) {
      throw new Error(`Product nrb-closure context is stale: ${normalized} does not match ${source}.`);
    }
  }
  return expected;
}
