import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { createTypecheckProject } from './typescript-typecheck.js';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

void describe('TypeScript typecheck inference', () => {
  void it('adds source and spec typechecks for a library', () => {
    const { projectFile, root } = fixture(['tsconfig.json', 'tsconfig.lib.json', 'tsconfig.spec.json']);
    const result = createTypecheckProject(projectFile, root);
    const command = inferredCommand(result);

    assert.match(command, /tsconfig\.lib\.json/);
    assert.match(command, /tsconfig\.spec\.json/);
    assert.match(command, /--noEmit --composite false --declaration false/);
    assert.match(command, /tsconfig\.spec\.json --rootDir \. --module esnext --moduleResolution bundler/);
  });

  void it('uses a direct tsconfig for TypeScript e2e projects', () => {
    const { projectFile, root } = fixture(['tsconfig.json']);
    const command = inferredCommand(createTypecheckProject(projectFile, root));

    assert.match(command, /--project apps\/example\/tsconfig\.json/);
    assert.doesNotMatch(command, /tsconfig\.spec\.json/);
  });

  void it('keeps renderer-specific explicit typechecks authoritative', () => {
    const { projectFile, root } = fixture(['tsconfig.json', 'tsconfig.app.json'], {
      typecheck: { executor: 'nx:run-commands' },
    });

    assert.deepEqual(createTypecheckProject(projectFile, root), {});
  });

  void it('does not invent a TypeScript target for non-TypeScript projects', () => {
    const { projectFile, root } = fixture([]);

    assert.deepEqual(createTypecheckProject(projectFile, root), {});
  });
});

function fixture(configs: string[], targets: Record<string, unknown> = {}): { projectFile: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), 'nrb-typecheck-plugin-'));
  temporaryRoots.push(root);
  const projectRoot = join(root, 'apps/example');
  mkdirSync(projectRoot, { recursive: true });
  writeFileSync(join(projectRoot, 'project.json'), JSON.stringify({ name: 'example', targets }));
  for (const config of configs) {
    writeFileSync(join(projectRoot, config), '{}');
  }
  return { projectFile: 'apps/example/project.json', root };
}

function inferredCommand(result: ReturnType<typeof createTypecheckProject>): string {
  const command = result.projects?.['apps/example']?.targets?.typecheck?.options?.command;
  assert.equal(typeof command, 'string');
  return command;
}
