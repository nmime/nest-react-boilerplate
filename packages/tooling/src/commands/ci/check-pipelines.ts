import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { CiContract, JobStyle } from './pipeline-contract';
import { parseCiContract } from './pipeline-contract';
import type { ForgeSources } from './pipeline-parity';
import { evaluateParity } from './pipeline-parity';

export const ciContractPath = 'scripts/ci/gates.json';

export interface CiPipelineCheckOptions {
  workspaceRoot: string;
  write?: (line: string) => void;
}

export function loadCiContract(workspaceRoot: string): CiContract {
  const path = resolve(workspaceRoot, ciContractPath);
  return parseCiContract(JSON.parse(readFileSync(path, 'utf8')) as unknown);
}

/**
 * Every pipeline file the descriptor names, for validators that scan pipeline *text*
 * rather than evaluate gate parity. Those validators used to hardcode `.github/workflows`,
 * which made them dead code on any other forge; asking the descriptor instead means a
 * product that renames its forge keeps them.
 *
 * A descriptor that is missing or does not parse yields nothing: `runCiPipelineCheck` is
 * the gate that reports why, and a scanner crashing on the same file would only bury that
 * message behind an unrelated stack trace.
 */
export function declaredPipelineFiles(workspaceRoot: string): string[] {
  if (!existsSync(resolve(workspaceRoot, ciContractPath))) return [];

  let contract: CiContract;
  try {
    contract = loadCiContract(workspaceRoot);
  } catch {
    return [];
  }

  const files = new Set<string>();
  for (const forge of Object.values(contract.forges)) {
    files.add(forge.pipeline);
    if (forge.releasePipeline !== undefined) files.add(forge.releasePipeline);
    if (forge.promotionPipeline !== undefined) files.add(forge.promotionPipeline);
  }
  for (const lane of Object.values(contract.lanes)) {
    for (const executor of Object.values(lane.executors)) files.add(executor.file);
  }

  return [...files].sort();
}

export interface ConfiguredForge {
  id: string;
  jobStyle: JobStyle;
  pipeline: string;
  releasePipeline?: string;
  promotionPipeline?: string;
}

/**
 * The forges this checkout actually ships, with the release and promotion pipelines each one
 * declares. A validator that asserts things about release or promotion text asks for this
 * instead of opening `.github/workflows/...` by name, so a product that keeps one forge runs
 * the validator against its own pipelines rather than failing on a file it never had.
 *
 * `jobStyle` travels with the forge because some assertions are genuinely dialect-specific —
 * `GITHUB_SHA` and `gh pr create` have no meaning in a GitLab pipeline.
 */
export function configuredForges(workspaceRoot: string): ConfiguredForge[] {
  if (!existsSync(resolve(workspaceRoot, ciContractPath))) return [];

  let contract: CiContract;
  try {
    contract = loadCiContract(workspaceRoot);
  } catch {
    return [];
  }

  return Object.entries(contract.forges)
    .filter(([, forge]) => existsSync(resolve(workspaceRoot, forge.pipeline)))
    .map(([id, forge]) => ({
      id,
      jobStyle: forge.jobStyle,
      pipeline: forge.pipeline,
      ...(forge.releasePipeline === undefined ? {} : { releasePipeline: forge.releasePipeline }),
      ...(forge.promotionPipeline === undefined ? {} : { promotionPipeline: forge.promotionPipeline }),
    }));
}

function readIfPresent(workspaceRoot: string, file: string | undefined): string | undefined {
  if (file === undefined) return undefined;
  const path = resolve(workspaceRoot, file);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/**
 * A forge whose pipeline file is absent is `undefined`, not an empty string: a product
 * that keeps one forge must get an explicit "not configured" result instead of a
 * validator that either crashes or quietly passes over every gate it can no longer see.
 */
export function collectForgeSources(
  workspaceRoot: string,
  contract: CiContract,
): Record<string, ForgeSources | undefined> {
  const sources: Record<string, ForgeSources | undefined> = {};

  for (const [forgeId, forge] of Object.entries(contract.forges)) {
    const pipeline = readIfPresent(workspaceRoot, forge.pipeline);
    if (pipeline === undefined) {
      sources[forgeId] = undefined;
      continue;
    }

    const laneFiles: Record<string, string | undefined> = {};
    for (const lane of Object.values(contract.lanes)) {
      const executor = lane.executors[forgeId];
      if (executor === undefined || executor.file in laneFiles) continue;
      laneFiles[executor.file] = readIfPresent(workspaceRoot, executor.file);
    }

    sources[forgeId] = {
      pipeline,
      ...(forge.releasePipeline === undefined ? {} : { releasePipeline: readIfPresent(workspaceRoot, forge.releasePipeline) }),
      ...(forge.promotionPipeline === undefined
        ? {}
        : { promotionPipeline: readIfPresent(workspaceRoot, forge.promotionPipeline) }),
      laneFiles,
    };
  }

  return sources;
}

export function runCiPipelineCheck({ workspaceRoot, write }: CiPipelineCheckOptions): number {
  const emit = write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const contract = loadCiContract(workspaceRoot);
  const sources = collectForgeSources(workspaceRoot, contract);
  const report = evaluateParity(contract, sources);
  const configured = Object.keys(contract.forges).filter((forgeId) => sources[forgeId] !== undefined);

  emit(`CI gate descriptor: ${ciContractPath}`);
  emit(`  forges configured: ${configured.length === 0 ? 'none' : configured.join(', ')}`);
  for (const forgeId of report.skippedForges) {
    emit(`  forge not configured, skipped: ${forgeId}`);
  }
  emit(`  gates: ${contract.gates.length}, lanes: ${Object.keys(contract.lanes).length}`);
  emit(`  supply-chain controls: ${contract.supplyChain.length}`);

  if (report.problems.length === 0) {
    emit('CI pipeline parity: ok');
    return 0;
  }

  for (const problem of report.problems) {
    emit(`  [${problem.code}] ${problem.message}`);
  }
  emit(`CI pipeline parity: ${report.problems.length} problem(s)`);

  return 1;
}
