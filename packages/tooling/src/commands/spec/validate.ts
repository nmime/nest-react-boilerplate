import { parseArgs } from '../../runtime/args';
import {
  createTraceReport,
  loadAssuranceModel,
  runOpenSpecValidation,
  writeTraceReport,
} from './assurance';

export interface SpecCommandOptions {
  argv?: string[];
  workspaceRoot?: string;
}

export function runSpecValidate(options: SpecCommandOptions = {}): number {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const args = parseArgs(options.argv ?? []);
  const model = loadAssuranceModel(workspaceRoot);
  const report = createTraceReport(model);
  const reportPath = args.options.get('report') ?? 'test-results/spec-evidence/trace.json';
  writeTraceReport(workspaceRoot, report, reportPath);

  const openspec = args.flags.has('skip-openspec')
    ? null
    : runOpenSpecValidation(workspaceRoot);
  if (openspec !== null && openspec.status !== 0) {
    report.errors.push(
      `OpenSpec strict validation failed: ${openspec.stderr || openspec.stdout || openspec.error}`,
    );
    report.status = 'failed';
    writeTraceReport(workspaceRoot, report, reportPath);
  }

  const output = {
    status: report.status,
    report: reportPath,
    projects: report.totals.projects,
    coveredProjects: report.totals.coveredProjects,
    behaviorTests: report.totals.behaviorTests,
    tracedBehaviorTests: report.totals.tracedBehaviorTests,
    features: report.totals.features,
    scenarios: report.totals.scenarios,
    requirements: report.totals.requirements,
    evidence: report.totals.evidence,
    errors: report.errors,
    warnings: report.warnings,
  };
  const serialized = JSON.stringify(output, null, args.flags.has('json') ? 2 : 0);
  (report.status === 'ok' ? console.log : console.error)(serialized);
  return report.status === 'ok' ? 0 : 1;
}
