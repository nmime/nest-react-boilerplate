// @requirements REQ-FRONTEND-SSR-007
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { findMissingVikeBuildOutputs } from './vike-build-output.mjs';

const distRootWith = (relativePaths) => {
  const distRoot = mkdtempSync(join(tmpdir(), 'site-build-output-'));

  for (const relativePath of relativePaths) {
    const absolutePath = join(distRoot, relativePath);
    mkdirSync(join(absolutePath, '..'), { recursive: true });
    writeFileSync(absolutePath, '');
  }

  return distRoot;
};

describe('Vike build output contract', () => {
  // Vike's `build()` resolves even when it could not execute `+config.ts`: it logs the failure,
  // builds an app with no pages, and leaves the server entry the Fastify host imports unwritten.
  // Only the absent artefact tells the build it failed, so this is what the build gate asserts.
  it('reports the server entry and the client assets a broken build never wrote', () => {
    expect(findMissingVikeBuildOutputs(distRootWith([]))).toEqual(['server/entry.mjs', 'client']);
  });

  it('reports nothing once both are present', () => {
    expect(findMissingVikeBuildOutputs(distRootWith(['server/entry.mjs', 'client/index.html']))).toEqual([]);
  });

  // A `client` file where the static root belongs would let the Fastify host start and then fail
  // to serve every asset, so the directory has to be a directory.
  it('reports the client root when it is not a directory', () => {
    expect(findMissingVikeBuildOutputs(distRootWith(['server/entry.mjs', 'client']))).toEqual(['client']);
  });
});
