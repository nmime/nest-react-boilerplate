import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import istanbulCoverage from 'istanbul-lib-coverage';

const coveragePath = resolve(import.meta.dirname, '../../../../coverage/e2e/apps/frontend/app/coverage-final.json');
const summary = istanbulCoverage
  .createCoverageMap(JSON.parse(readFileSync(coveragePath, 'utf8')))
  .getCoverageSummary()
  .toJSON();
const minimumCovered = { branches: 84, functions: 72, lines: 239, statements: 260 };

// An absolute covered-count floor alone can be satisfied by growing the codebase: add
// untested files and `covered` stays put while the ratio falls. The percentage floor below
// is what actually scales with the source tree. It is a fair demand because the coverage run
// walks every route the shell links to rather than the entry page alone, so a page added to
// the route registry raises `covered` and `total` together. A page that the app never links
// to has to be named with `--visit` in the e2e target, or this ratio falls.
// These percentages are seeded from the committed counts above and should be ratcheted
// upward from the values this script prints.
const minimumPct = { branches: 24, functions: 47, lines: 46, statements: 47 };

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

console.log(JSON.stringify({ project: 'user-app:e2e', minimumCovered, minimumPct, status: 'ok', summary }));
