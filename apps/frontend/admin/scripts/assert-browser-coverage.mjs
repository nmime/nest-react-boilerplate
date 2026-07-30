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

// An absolute covered-count floor alone can be satisfied by growing the codebase: add
// untested files and `covered` stays put while the ratio falls. The percentage floor below
// is what actually scales with the source tree. These percentages are seeded from the
// committed counts above and should be ratcheted upward from the values this script prints.
const minimumPct = { branches: 2, functions: 6, lines: 13, statements: 14 };

for (const [metric, minimum] of Object.entries(minimumCovered)) {
  assert.ok(
    summary[metric].covered >= minimum,
    `${metric} covered count ${summary[metric].covered} is below ${minimum}`,
  );
  assert.ok(
    summary[metric].pct >= minimumPct[metric],
    `${metric} coverage ${summary[metric].pct}% is below ${minimumPct[metric]}% (covered ${summary[metric].covered} of ${summary[metric].total})`,
  );
}

console.log(JSON.stringify({ project: 'admin-app:e2e', minimumCovered, minimumPct, status: 'ok', summary }));
