#!/usr/bin/env node
// Evidence for: REQ-ASSURANCE-RELEASE-003
/**
 * Licence compliance gate for the production dependency tree.
 *
 * `pnpm audit` covers vulnerabilities but says nothing about licensing, and the repo had no
 * licence control at all. This asserts every production dependency resolves to an allow-listed
 * SPDX expression, and that packages declaring no licence are individually acknowledged — so a
 * newly introduced unlicensed or copyleft dependency fails the build instead of shipping.
 */
import { execFileSync } from 'node:child_process';

/** SPDX expressions cleared for redistribution in this boilerplate. */
export const allowedLicenses = new Set([
  '0BSD',
  'Apache-2.0',
  'Apache-2.0 AND MIT',
  '(Apache-2.0 AND BSD-3-Clause)',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  '(BSD-2-Clause OR MIT OR Apache-2.0)',
  'BSD-3-Clause',
  '(BSD-3-Clause OR GPL-2.0)',
  'CC-BY-4.0',
  'CC0-1.0',
  'ISC',
  'LGPL-3.0-or-later',
  'MIT',
  'MIT AND Apache-2.0',
  'MIT-0',
  '(MIT OR Apache-2.0)',
  '(MIT OR CC0-1.0)',
  '(MIT OR WTFPL)',
  'MPL-2.0',
  '(MPL-2.0 OR Apache-2.0)',
  'Python-2.0',
  'Unicode-DFS-2016',
  'Unlicense',
  'WTFPL OR MIT',
]);

/**
 * Packages whose manifest omits a licence field. Each is MIT upstream; they are listed
 * individually so that a *new* package with no licence still fails.
 */
export const acknowledgedUnlicensed = new Set([
  '@tamagui/context-menu',
  '@tamagui/focus-guard',
  '@tamagui/menu',
  '@tamagui/native',
  '@tamagui/toast',
]);

const unknownLicenseKeys = new Set(['Unknown', 'UNKNOWN', '']);

/**
 * @param {Record<string, Array<{ name?: string }>>} inventory `pnpm licenses list --json` output
 * @returns {string[]} human-readable violations, empty when compliant
 */
export function collectLicenseViolations(inventory) {
  const violations = [];

  for (const [license, packages] of Object.entries(inventory)) {
    const names = (Array.isArray(packages) ? packages : []).map((entry) => entry?.name ?? '<unnamed>');

    if (unknownLicenseKeys.has(license)) {
      for (const name of names) {
        if (!acknowledgedUnlicensed.has(name)) {
          violations.push(`${name}: declares no licence and is not acknowledged in scripts/check-licenses.mjs`);
        }
      }
      continue;
    }

    if (!allowedLicenses.has(license)) {
      violations.push(`${license}: not allow-listed (${names.slice(0, 5).join(', ')}${names.length > 5 ? ', …' : ''})`);
    }
  }

  return violations;
}

function main() {
  const raw = execFileSync('pnpm', ['licenses', 'list', '--json', '--prod'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const inventory = JSON.parse(raw);
  const violations = collectLicenseViolations(inventory);

  if (violations.length > 0) {
    console.error('Licence compliance check failed:');
    for (const violation of violations) console.error(`- ${violation}`);
    process.exit(1);
  }

  console.log(
    JSON.stringify({
      status: 'ok',
      licenses: Object.keys(inventory).length,
      acknowledgedUnlicensed: acknowledgedUnlicensed.size,
    }),
  );
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) {
  main();
}
