import { parseArgs } from '../../runtime/args';
import {
  createTraceReport,
  loadAssuranceModel,
  writeTraceReport,
} from './assurance';
import type { SpecCommandOptions } from './validate';

export function runSpecTrace(options: SpecCommandOptions = {}): number {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const args = parseArgs(options.argv ?? []);
  const reportPath = args.options.get('report') ?? 'test-results/spec-evidence/trace.json';
  const report = createTraceReport(loadAssuranceModel(workspaceRoot));
  writeTraceReport(workspaceRoot, report, reportPath);
  console.log(JSON.stringify({ ...report, report: reportPath }, null, 2));
  return report.status === 'ok' ? 0 : 1;
}
