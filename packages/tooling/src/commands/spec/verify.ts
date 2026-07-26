import { parseArgs } from '../../runtime/args';
import {
  calculateImpact,
  evidenceLanes,
  loadAssuranceModel,
  verifyRequirements,
} from './assurance';
import type { EvidenceLane } from './assurance';
import type { SpecCommandOptions } from './validate';

export function runSpecVerify(options: SpecCommandOptions = {}): number {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const args = parseArgs(options.argv ?? []);
  const model = loadAssuranceModel(workspaceRoot);
  if (model.errors.length > 0) {
    console.error(JSON.stringify({ status: 'failed', errors: model.errors }, null, 2));
    return 1;
  }
  const all = args.flags.has('all');
  const laneOption = args.options.get('lane') ?? 'pr';
  if (!evidenceLanes.includes(laneOption as EvidenceLane)) {
    console.error(
      JSON.stringify(
        {
          status: 'failed',
          error: `Invalid evidence lane "${laneOption}". Expected one of: ${evidenceLanes.join(', ')}`,
        },
        null,
        2,
      ),
    );
    return 1;
  }
  const lane = laneOption as EvidenceLane;
  const base = args.options.get('base') ?? 'origin/main';
  const head = args.options.get('head') ?? 'HEAD';
  let requirementIds: string[];
  if (all) {
    requirementIds = [...model.requirements.keys()];
  } else {
    try {
      requirementIds = calculateImpact(model, base, head).requirementIds;
    } catch (error) {
      console.error(
        JSON.stringify(
          {
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        ),
      );
      return 1;
    }
  }
  const report = verifyRequirements({
    model,
    requirementIds,
    dryRun: args.flags.has('dry-run'),
    lane,
    ...(!all ? { base, head } : {}),
    reportPath: args.options.get('report'),
  });
  console.log(
    JSON.stringify(
      {
        status: report.status,
        lane: report.lane,
        requirements: report.requirementIds.length,
        runs: report.runs.length,
        report:
          args.options.get('report') ?? 'test-results/spec-evidence/assurance.json',
      },
      null,
      2,
    ),
  );
  return report.status === 'failed' ? 1 : 0;
}
