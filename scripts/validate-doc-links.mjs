#!/usr/bin/env node
/**
 * Validate internal relative links in documentation files.
 *
 * Scans all .md files under docs/ for [text](relative/path) links and
 * verifies that the target file exists.  Ignores external URLs, anchor-only
 * links (#heading), and links to files outside docs/.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const DOCS_DIR = join(process.cwd(), 'docs');
const ROOT_DIR = process.cwd();
const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
const results = { ok: [], fail: [] };

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      checkFile(full);
    }
  }
}

function checkFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  let m;
  while ((m = linkPattern.exec(content)) !== null) {
    const [, , rawHref] = m;
    // Skip external URLs, anchors, mailto, etc.
    if (/^https?:\/\//.test(rawHref)) continue;
    if (/^mailto:/.test(rawHref)) continue;
    if (/^#/.test(rawHref)) continue;
    if (/^\/\//.test(rawHref)) continue;

    const href = rawHref.split('#')[0]; // strip anchor fragment
    if (!href || href === '.') continue;

    // Resolve relative to the file's directory
    let targetPath;
    targetPath = resolve(dirname(filePath), href);

    // Remove .md suffix if present for comparison
    if (existsSync(targetPath)) {
      results.ok.push(`${filePath}:${lineNo(content, m.index)}: ${href} ✓`);
    } else {
      results.fail.push(`${filePath}:${lineNo(content, m.index)}: ${href} → ${targetPath} ✗`);
    }
  }
}

function lineNo(content, pos) {
  return content.slice(0, pos).split('\n').length;
}

walk(DOCS_DIR);

const total = results.ok.length + results.fail.length;
const pass = results.ok.length;
const fail = results.fail.length;

if (results.fail.length > 0) {
  console.error(`\n❌ ${fail}/${total} internal link(s) broken:`);
  for (const line of results.fail) console.error(`  ${line}`);
  process.exit(1);
}

console.log(`✓ ${pass}/${total} internal link(s) valid. 0 broken.`);
process.exit(0);
