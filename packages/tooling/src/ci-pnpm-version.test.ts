// @requirements REQ-SCAFFOLD-TOOLING-005
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { configuredForges } from './commands/ci/check-pipelines';
import { mismatchedPnpmPins, pnpmPinSources } from './commands/ci/pnpm-pins';

const workspaceRoot = process.cwd();

function configuredPnpmVersion(): string {
  const packageJson = JSON.parse(readFileSync(join(workspaceRoot, 'package.json'), 'utf8')) as {
    packageManager?: string;
  };
  const match = /^pnpm@(\d+\.\d+\.\d+)$/.exec(packageJson.packageManager ?? '');
  assert.ok(match, 'package.json must pin an exact pnpm packageManager version');
  return match[1];
}

void describe('CI pnpm version alignment', () => {
  void it('keeps every declared pipeline pnpm pin aligned with packageManager', (t) => {
    // A checkout that configures no forge is not silently unchecked: it is reported here and
    // failed by ci-pipeline-parity, which is what proves a forge cannot drop a gate unannounced.
    if (configuredForges(workspaceRoot).length === 0) {
      t.skip('not applicable: scripts/ci/gates.json declares no forge this checkout ships');
      return;
    }

    const sources = pnpmPinSources(workspaceRoot);
    assert.ok(sources.length > 0, 'every configured forge must declare the pipeline that installs pnpm');

    assert.deepEqual(mismatchedPnpmPins(sources, configuredPnpmVersion()), []);
  });
});
