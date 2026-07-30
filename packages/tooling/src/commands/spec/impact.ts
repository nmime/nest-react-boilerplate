import { parseArgs } from '../../runtime/args';
import { writeJson } from '../../runtime/files';
import { calculateImpact, loadAssuranceModel } from './assurance';
import type { SpecCommandOptions } from './validate';
import { resolve } from 'node:path';

export function runSpecImpact(options: SpecCommandOptions = {}): number {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const args = parseArgs(options.argv ?? []);
  const base = args.options.get('base') ?? 'origin/main';
  const head = args.options.get('head') ?? 'HEAD';
  const reportPath = args.options.get('report') ?? 'test-results/spec-evidence/impact.json';
  const model = loadAssuranceModel(workspaceRoot);
  if (model.errors.length > 0) {
    console.error(JSON.stringify({ status: 'failed', errors: model.errors }, null, 2));
    return 1;
  }
  try {
    const report = calculateImpact(model, base, head);
    writeJson(resolve(workspaceRoot, reportPath), report);
    console.log(JSON.stringify({ status: 'ok', report: reportPath, ...report }, null, 2));
    return 0;
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
