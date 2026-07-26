import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Given, Then, When } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../support/world.ts';

// Executable acceptance evidence for REQ-ASSURANCE-TRACE-001 and
// REQ-ASSURANCE-RELEASE-003.
Given('the repository assurance model', function (this: AcceptanceWorld) {
  this.assuranceExitCode = undefined;
});

When('its project and evidence ownership is validated', function (this: AcceptanceWorld) {
  const toolingBin = resolve(process.cwd(), 'packages/tooling/bin/repo-tooling.mjs');
  const result = spawnSync(process.execPath, [toolingBin, 'spec', 'trace'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      NX_DAEMON: 'false',
      OPENSPEC_TELEMETRY: '0',
    },
  });
  this.assuranceExitCode = result.status;
});

Then('no project, requirement, feature, or scenario is orphaned', function (this: AcceptanceWorld) {
  assert.equal(this.assuranceExitCode, 0);
});

Given('the release workflow', function (this: AcceptanceWorld) {
  this.releaseWorkflow = readFileSync('.github/workflows/release.yml', 'utf8');
});

When('its successful CI provenance is inspected', function (this: AcceptanceWorld) {
  assert.match(this.releaseWorkflow ?? '', /workflow_run:/u);
  assert.match(this.releaseWorkflow ?? '', /conclusion == 'success'/u);
});

Then('it checks out the successful workflow SHA', function (this: AcceptanceWorld) {
  assert.match(this.releaseWorkflow ?? '', /ref:\s+\$\{\{\s*github\.event\.workflow_run\.head_sha\s*\}\}/u);
});

Then('it refuses a SHA that is no longer current main', function (this: AcceptanceWorld) {
  assert.match(this.releaseWorkflow ?? '', /origin\/main.*VERIFIED_SHA/u);
});
