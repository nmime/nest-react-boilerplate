import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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

/**
 * Release provenance is a forge-neutral control, so its evidence reads the CI gate descriptor
 * rather than one forge's YAML. Reading `.github/workflows/release.yml` by name made this
 * requirement unsatisfiable on a checkout that ships another forge — the step threw ENOENT
 * before it asserted anything, even though scripts/ci/gates.json declares a GitLab release lane.
 *
 * The descriptor is read from disk here instead of through @repo/tooling: these steps run in the
 * acceptance app, which does not depend on the tooling package, and the parsing at stake is one
 * JSON.parse. `node scripts/ci/check-pipelines.mjs` is the gate that evaluates these same
 * controls on every forge; this scenario is the requirement's own account of what they say.
 */
interface SupplyChainControl {
  id: string;
  requirement: string;
  scope: string;
  evidence: string[];
  forges?: string[];
  reason?: string;
}

interface DescriptorForge {
  pipeline: string;
  provenancePipeline?: string;
}

interface GateDescriptor {
  forges: Record<string, DescriptorForge>;
  supplyChain: SupplyChainControl[];
}

function gateDescriptor(): GateDescriptor {
  return JSON.parse(readFileSync(resolve(process.cwd(), 'scripts/ci/gates.json'), 'utf8')) as GateDescriptor;
}

/** The forges this checkout actually ships, keyed the way the descriptor names them. */
function configuredForges(): Array<[string, DescriptorForge]> {
  return Object.entries(gateDescriptor().forges).filter(([, forge]) =>
    existsSync(resolve(process.cwd(), forge.pipeline)),
  );
}

function provenanceControls(): SupplyChainControl[] {
  return gateDescriptor().supplyChain.filter(({ scope }) => scope === 'provenance');
}

/**
 * Assert one control against every configured forge that it applies to. A forge the control
 * deliberately excludes is not a silent pass: the descriptor has to say why, and a control that
 * ends up applying to no configured forge has to be an excluded one.
 */
function assertProvenanceControl(id: string): void {
  const control = provenanceControls().find((candidate) => candidate.id === id);
  assert.ok(control, `scripts/ci/gates.json must declare the "${id}" release-provenance control`);

  const asserted: string[] = [];
  const excluded: string[] = [];
  for (const [forgeId, forge] of configuredForges()) {
    if (control.forges !== undefined && !control.forges.includes(forgeId)) {
      excluded.push(forgeId);
      continue;
    }
    assert.ok(
      forge.provenancePipeline,
      `${forgeId} declares no pipeline that cuts a release, so "${id}" cannot hold there`,
    );
    const pipeline = readFileSync(resolve(process.cwd(), forge.provenancePipeline), 'utf8');
    for (const needle of control.evidence) {
      assert.ok(
        pipeline.includes(needle),
        `${forgeId} ${forge.provenancePipeline} does not implement "${id}": ${needle}`,
      );
    }
    asserted.push(forgeId);
  }

  if (asserted.length === 0) {
    assert.ok(
      excluded.length > 0 && control.reason,
      `no configured forge is in scope for "${id}" and the descriptor records no reason`,
    );
  }
}

Given('the release provenance controls in the CI gate descriptor', function (this: AcceptanceWorld) {
  const controls = provenanceControls();
  assert.ok(controls.length > 0, 'scripts/ci/gates.json must declare what release provenance means');
  for (const control of controls) {
    assert.ok(
      control.forges === undefined || control.reason,
      `${control.id} holds on only some forges and must record why`,
    );
  }
});

When("every configured forge's release pipeline is inspected", function (this: AcceptanceWorld) {
  const forges = configuredForges();
  assert.ok(forges.length > 0, 'scripts/ci/gates.json declares no forge this checkout ships');
  for (const [forgeId, forge] of forges) {
    assert.ok(forge.provenancePipeline, `${forgeId} declares no pipeline that cuts a release`);
  }
});

Then('each release is cut from the exact revision its gates verified', function (this: AcceptanceWorld) {
  assertProvenanceControl('release-exact-revision');
  assertProvenanceControl('release-follows-verified-gates');
});

Then('a revision the default branch has moved past is refused', function (this: AcceptanceWorld) {
  assertProvenanceControl('release-refuses-stale-head');
});
