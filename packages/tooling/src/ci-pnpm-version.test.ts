import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const workspaceRoot = process.cwd();
const workflowsDirectory = join(workspaceRoot, '.github', 'workflows');

function configuredPnpmVersion(): string {
  const packageJson = JSON.parse(readFileSync(join(workspaceRoot, 'package.json'), 'utf8')) as {
    packageManager?: string;
  };
  const match = /^pnpm@(\d+\.\d+\.\d+)$/.exec(packageJson.packageManager ?? '');
  assert.ok(match, 'package.json must pin an exact pnpm packageManager version');
  return match[1];
}

function workflowSources(): Array<{ name: string; source: string }> {
  return readdirSync(workflowsDirectory)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map((name) => ({
      name,
      source: readFileSync(join(workflowsDirectory, name), 'utf8'),
    }));
}

function mismatchedPins(name: string, source: string, expected: string): string[] {
  const pins = [...source.matchAll(/PNPM_VERSION[:=]\s*["']?(\d+\.\d+\.\d+)/g)].map((match) => match[1]);

  if (source.includes('pnpm/action-setup')) {
    for (const block of source.split('pnpm/action-setup').slice(1)) {
      const literal = /^@[^\n]+\n\s+with:\n\s+version:\s*(\d+\.\d+\.\d+)/m.exec(block);
      if (literal) {
        pins.push(literal[1]);
      }
    }
  }

  return pins.filter((pin) => pin !== expected).map((pin) => `${name}: ${pin}`);
}

void describe('CI pnpm version alignment', () => {
  void it('keeps every workflow pnpm pin aligned with packageManager', () => {
    const expected = configuredPnpmVersion();
    const mismatches = workflowSources().flatMap(({ name, source }) => mismatchedPins(name, source, expected));

    assert.deepEqual(mismatches, []);
  });
});
