#!/usr/bin/env node
// Evidence for: REQ-ASSURANCE-RELEASE-003
/**
 * Verify every configured forge renders the gate inventory in scripts/ci/gates.json.
 *
 * The inventory used to exist only as GitHub workflow text, so a second forge could
 * drop a gate without anything noticing. This entry point is deliberately thin: the
 * comparison lives in packages/tooling/src/commands/ci so it is unit tested.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const jiti = createJiti(import.meta.url);
const { runCiPipelineCheck } = await jiti.import('../../packages/tooling/src/commands/ci/check-pipelines.ts');

process.exitCode = runCiPipelineCheck({ workspaceRoot });
