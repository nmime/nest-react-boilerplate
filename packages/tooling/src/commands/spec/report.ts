import { parseArgs } from '../../runtime/args';
import { writeVerificationMarkdown } from './assurance';
import type { SpecCommandOptions } from './validate';

export function runSpecReport(options: SpecCommandOptions = {}): number {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const args = parseArgs(options.argv ?? []);
  const reportPath =
    args.options.get('input') ?? 'test-results/spec-evidence/assurance.json';
  const outputPath =
    args.options.get('output') ?? 'test-results/spec-evidence/assurance.md';
  try {
    writeVerificationMarkdown(workspaceRoot, reportPath, outputPath);
    console.log(JSON.stringify({ status: 'ok', input: reportPath, output: outputPath }));
    return 0;
  } catch (error) {
    console.error(
      JSON.stringify({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return 1;
  }
}
