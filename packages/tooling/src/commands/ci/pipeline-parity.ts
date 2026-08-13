import type { CiContract, CiForge, CiGate, PipelineKind, SupplyChainControl } from './pipeline-contract';
import { extractJob, referencesJob } from './pipeline-contract';

export type ParityProblemCode =
  | 'gate-not-mapped'
  | 'pipeline-missing'
  | 'job-missing'
  | 'command-missing'
  | 'toolchain-missing'
  | 'aggregate-missing'
  | 'aggregate-missing-job'
  | 'lane-without-executor'
  | 'lane-executor-missing'
  | 'supply-chain-lane-missing'
  | 'supply-chain-control-missing';

export interface ParityProblem {
  code: ParityProblemCode;
  forge: string;
  gate?: string;
  /** Supply-chain control the problem belongs to, for callers that assert one control. */
  control?: string;
  message: string;
}

export interface ForgeSources {
  pipeline: string;
  releasePipeline?: string;
  promotionPipeline?: string;
  provenancePipeline?: string;
  /** Every file a lane executor can point at, keyed by workspace-relative path. */
  laneFiles: Record<string, string | undefined>;
}

export interface ParityReport {
  problems: ParityProblem[];
  /** Forges the workspace does not configure. Reported, never silently ignored. */
  skippedForges: string[];
}

function appliesTo(declaration: CiGate | SupplyChainControl, forgeId: string): boolean {
  return declaration.forges === undefined || declaration.forges.includes(forgeId);
}

function gatePipelineText(sources: ForgeSources, kind: PipelineKind): string | undefined {
  if (kind === 'release') return sources.releasePipeline;
  if (kind === 'promotion') return sources.promotionPipeline;
  return sources.pipeline;
}

function controlPipelineText(sources: ForgeSources, scope: SupplyChainControl['scope']): string | undefined {
  if (scope === 'release') return sources.releasePipeline;
  if (scope === 'promotion') return sources.promotionPipeline;
  return sources.provenancePipeline;
}

function gatePipelineFile(forge: CiForge, kind: PipelineKind): string {
  if (kind === 'release') return forge.releasePipeline ?? '<no release pipeline>';
  if (kind === 'promotion') return forge.promotionPipeline ?? '<no promotion pipeline>';
  return forge.pipeline;
}

/**
 * Compare the declared gate inventory against what each configured forge actually runs.
 *
 * Everything here is pure: the caller supplies pipeline text, so the same evaluation
 * covers the shipped repository and the fixtures that prove the checker still bites.
 */
export function evaluateParity(contract: CiContract, sources: Record<string, ForgeSources | undefined>): ParityReport {
  const problems: ParityProblem[] = [];
  const skippedForges: string[] = [];

  for (const [forgeId, forge] of Object.entries(contract.forges)) {
    const forgeSources = sources[forgeId];
    if (forgeSources === undefined) {
      skippedForges.push(forgeId);
      continue;
    }

    const requiredJobs = new Set<string>();

    for (const gate of contract.gates) {
      if (!appliesTo(gate, forgeId)) continue;

      const jobId = gate.jobs[forgeId];
      if (jobId === undefined) {
        problems.push({
          code: 'gate-not-mapped',
          forge: forgeId,
          gate: gate.id,
          message: `${forgeId} has no job for gate "${gate.id}" (${gate.description})`,
        });
        continue;
      }

      if (gate.requiredForMerge) requiredJobs.add(jobId);

      const pipelineFile = gatePipelineFile(forge, gate.pipeline);
      const pipelineText = gatePipelineText(forgeSources, gate.pipeline);
      if (pipelineText === undefined) {
        problems.push({
          code: 'pipeline-missing',
          forge: forgeId,
          gate: gate.id,
          message: `${forgeId} declares no ${gate.pipeline} pipeline for gate "${gate.id}"`,
        });
        continue;
      }

      const block = extractJob(pipelineText, jobId, forge.jobStyle);
      if (block === undefined) {
        problems.push({
          code: 'job-missing',
          forge: forgeId,
          gate: gate.id,
          message: `${pipelineFile} declares no job "${jobId}" for gate "${gate.id}"`,
        });
        continue;
      }

      if (!gate.commands.some((command) => block.includes(command))) {
        problems.push({
          code: 'command-missing',
          forge: forgeId,
          gate: gate.id,
          message: `${pipelineFile} job "${jobId}" runs none of: ${gate.commands.join(', ')}`,
        });
      }

      // A mapped job that runs the command still fails every time when the runner has no CLI
      // the command shells out to, and the forge image is not the descriptor's to assume.
      for (const toolchainId of gate.toolchain ?? []) {
        const provisioning = contract.toolchains[toolchainId]?.provisioning[forgeId];
        if (provisioning === undefined) {
          problems.push({
            code: 'toolchain-missing',
            forge: forgeId,
            gate: gate.id,
            message: `toolchain "${toolchainId}", which gate "${gate.id}" needs, declares no way to provision it on ${forgeId}`,
          });
          continue;
        }

        if (!block.includes(provisioning)) {
          problems.push({
            code: 'toolchain-missing',
            forge: forgeId,
            gate: gate.id,
            message: `${pipelineFile} job "${jobId}" runs gate "${gate.id}" without provisioning toolchain "${toolchainId}" (expected ${provisioning})`,
          });
        }
      }
    }

    const aggregate = extractJob(forgeSources.pipeline, forge.aggregateJob, forge.jobStyle);
    if (aggregate === undefined) {
      problems.push({
        code: 'aggregate-missing',
        forge: forgeId,
        message: `${forge.pipeline} declares no aggregate job "${forge.aggregateJob}"; branch protection would have to name every job by hand`,
      });
    } else {
      for (const jobId of [...requiredJobs].sort()) {
        if (jobId === forge.aggregateJob || referencesJob(aggregate, jobId)) continue;
        problems.push({
          code: 'aggregate-missing-job',
          forge: forgeId,
          message: `${forge.pipeline} aggregate "${forge.aggregateJob}" does not depend on merge-required job "${jobId}"`,
        });
      }
    }

    for (const [laneId, lane] of Object.entries(contract.lanes)) {
      const executor = lane.executors[forgeId];
      if (executor === undefined) {
        problems.push({
          code: 'lane-without-executor',
          forge: forgeId,
          message: `lane "${laneId}" (${lane.description}) has no executor on ${forgeId}`,
        });
        continue;
      }

      const text = forgeSources.laneFiles[executor.file];
      if (text === undefined || extractJob(text, executor.job, forge.jobStyle) === undefined) {
        problems.push({
          code: 'lane-executor-missing',
          forge: forgeId,
          message: `lane "${laneId}" names ${executor.file} job "${executor.job}" on ${forgeId}, which does not exist`,
        });
      }
    }

    for (const control of contract.supplyChain) {
      if (!appliesTo(control, forgeId)) continue;

      const lane = controlPipelineText(forgeSources, control.scope);
      if (lane === undefined) {
        problems.push({
          code: 'supply-chain-lane-missing',
          forge: forgeId,
          control: control.id,
          message: `${forgeId} declares no ${control.scope} pipeline, so control "${control.id}" cannot hold`,
        });
        continue;
      }

      const missing = control.evidence.filter((needle) => !lane.includes(needle));
      if (missing.length > 0) {
        problems.push({
          code: 'supply-chain-control-missing',
          forge: forgeId,
          control: control.id,
          message: `${forgeId} ${control.scope} lane does not implement "${control.id}" (${control.requirement}); missing: ${missing.join(', ')}`,
        });
      }
    }
  }

  return { problems, skippedForges };
}
