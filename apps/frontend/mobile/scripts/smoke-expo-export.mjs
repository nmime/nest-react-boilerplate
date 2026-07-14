import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const outputRoot = join(import.meta.dirname, '../../../../dist/apps/frontend/mobile');
const indexPath = join(outputRoot, 'index.html');

assert.equal(existsSync(indexPath), true, `Missing Expo web export: ${indexPath}`);
const html = readFileSync(indexPath, 'utf8');
assert.match(html, /<html/iu);
assert.match(html, /<script/iu);

console.log('Expo web export smoke passed.');
