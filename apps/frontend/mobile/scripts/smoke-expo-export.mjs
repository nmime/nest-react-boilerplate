import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const defaultWebOutputRoot = join(import.meta.dirname, '../../../../dist/apps/frontend/mobile');

export function assertExpoWebExport(outputRoot = defaultWebOutputRoot) {
  const indexPath = join(outputRoot, 'index.html');
  assert.equal(existsSync(indexPath), true, `Missing Expo web export: ${indexPath}`);
  const html = readFileSync(indexPath, 'utf8');
  assert.match(html, /<html/iu);
  assert.match(html, /<script/iu);

  return { indexPath };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify({ ...assertExpoWebExport(), platform: 'web', status: 'ok' }));
}
