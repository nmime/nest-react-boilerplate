import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import istanbulCoverage from 'istanbul-lib-coverage';

const coveragePath = resolve(import.meta.dirname, '../../../../coverage/e2e/apps/frontend/admin/coverage-final.json');
const summary = istanbulCoverage
  .createCoverageMap(JSON.parse(readFileSync(coveragePath, 'utf8')))
  .getCoverageSummary()
  .toJSON();
const minimumCovered = { branches: 27, functions: 37, lines: 190, statements: 203 };

for (const [metric, minimum] of Object.entries(minimumCovered)) {
  assert.ok(
    summary[metric].covered >= minimum,
    `${metric} covered count ${summary[metric].covered} is below ${minimum}`,
  );
}

console.log(JSON.stringify({ project: 'admin-app:e2e', minimumCovered, status: 'ok', summary }));
