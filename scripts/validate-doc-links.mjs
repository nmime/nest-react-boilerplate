#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ignoredDirectories = new Set([
  '.cache',
  '.git',
  '.nx',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
  'tmp',
]);
const markdownLinkPattern = /!?(?:\[[^\]]*\])\(([^)]+)\)/gu;
const pnpmRunPattern = /\bpnpm\s+run\s+([@A-Za-z0-9_.:-]+)/gu;
const duplicatedProjectMetadataPattern =
  /^\s{0,3}(?:(?:[-*+]|>)\s+)?(?:\*\*|__)?(?:Path|Nx\s+project|Package|Project\s+type|Tags|Runtime|Local\s+URL|(?:(?:Default|Staging)\s+)?(?:Local\s+)?Ports?)(?:\*\*|__)?\s*:\s*(?:\*\*|__)?\s+\S/iu;
const duplicatedProjectMapHeadingPattern = /^\s{0,3}#{1,6}\s+Project\s+names?\s+and\s+paths?\s*#*\s*$/iu;
const duplicatedScopeValuePattern = /\bRespect the declared scope tag\s*:/iu;
const genericLibraryPurposePattern =
  /^(?:(?:Backend common|Backend test utility|Backend feature-(?:main|shared)|Backend PostgreSQL\/data-access|Frontend shared|Frontend shared UI|Frontend SDK\/client|Frontend feature-shared|Cross-runtime framework-neutral) library for the [a-z0-9-]+ scope\.|[A-Z][A-Za-z0-9 /-]+ library\.)(?:\s|$)/iu;

export function collectTrackedMarkdown(workspaceRoot) {
  try {
    const output = execFileSync('git', ['ls-files', '-z', '--', '*.md'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return output
      .split('\0')
      .filter(Boolean)
      .map((file) => resolve(workspaceRoot, file))
      .filter((file) => existsSync(file));
  } catch {
    return collectMarkdownRecursively(workspaceRoot);
  }
}

export function validateWorkspace({ workspaceRoot, markdownFiles = collectTrackedMarkdown(workspaceRoot) }) {
  const rootScripts = readRootScripts(workspaceRoot);
  const failures = [];
  const counts = { anchors: 0, files: markdownFiles.length, links: 0, scripts: 0 };
  const headingCache = new Map();

  for (const filePath of markdownFiles) {
    const content = readFileSync(filePath, 'utf8');
    const workspacePath = relative(workspaceRoot, filePath).replaceAll('\\', '/');

    const isLeafProjectDoc = /^(?:apps|libs)\/.+\/(?:AGENTS|README)\.md$/u.test(workspacePath);
    const isRootChangelog = workspacePath === 'CHANGELOG.md';
    forEachMarkdownLineOutsideFences(content, (line, lineNumber) => {
      if (isLeafProjectDoc && duplicatedProjectMetadataPattern.test(line)) {
        failures.push(
          formatFailure(
            workspaceRoot,
            filePath,
            lineNumber,
            'duplicated project metadata; use project.json, docs/project-catalog.md, or docs/PORTS.md',
          ),
        );
      }
      if (isLeafProjectDoc && duplicatedScopeValuePattern.test(line)) {
        failures.push(
          formatFailure(
            workspaceRoot,
            filePath,
            lineNumber,
            'duplicated scope value; refer to the tags declared in project.json',
          ),
        );
      }
      if (!isRootChangelog && duplicatedProjectMapHeadingPattern.test(line)) {
        failures.push(
          formatFailure(workspaceRoot, filePath, lineNumber, 'duplicated project map; link to docs/project-catalog.md'),
        );
      }
    });

    if (/^libs\/.+\/lib\/README\.md$/u.test(workspacePath)) {
      validateLibraryReadme({ content, failures, filePath, workspaceRoot });
    }

    for (const match of content.matchAll(markdownLinkPattern)) {
      const rawHref = normalizeMarkdownHref(match[1] ?? '');
      if (!rawHref || isExternalHref(rawHref)) continue;

      const line = lineNumber(content, match.index ?? 0);
      const [rawPath, rawFragment] = splitHref(rawHref);
      let targetPath = rawPath ? resolve(dirname(filePath), decodeHref(rawPath)) : filePath;

      if (rawPath) {
        counts.links += 1;
        if (!existsSync(targetPath)) {
          failures.push(formatFailure(workspaceRoot, filePath, line, `missing local target "${rawPath}"`));
          continue;
        }
        if (statSync(targetPath).isDirectory()) {
          const readmePath = resolve(targetPath, 'README.md');
          if (rawFragment && existsSync(readmePath)) targetPath = readmePath;
        }
      }

      if (rawFragment && targetPath.endsWith('.md')) {
        counts.anchors += 1;
        const expectedAnchor = decodeHref(rawFragment).toLowerCase();
        const anchors = getMarkdownAnchors(targetPath, headingCache);
        if (!anchors.has(expectedAnchor)) {
          failures.push(
            formatFailure(
              workspaceRoot,
              filePath,
              line,
              `missing anchor "#${rawFragment}" in ${relative(workspaceRoot, targetPath)}`,
            ),
          );
        }
      }
    }

    for (const match of content.matchAll(pnpmRunPattern)) {
      const script = match[1];
      if (!script) continue;
      counts.scripts += 1;
      if (!rootScripts.has(script)) {
        failures.push(
          formatFailure(
            workspaceRoot,
            filePath,
            lineNumber(content, match.index ?? 0),
            `unknown root script "pnpm run ${script}"`,
          ),
        );
      }
    }
  }

  return { counts, failures };
}

function validateLibraryReadme({ content, failures, filePath, workspaceRoot }) {
  const lines = [];
  forEachMarkdownLineOutsideFences(content, (line, lineNumber) => lines.push({ line, lineNumber }));
  const purposeHeadingIndex = lines.findIndex(({ line }) => /^\s{0,3}##\s+Purpose\s*#*\s*$/iu.test(line));
  if (purposeHeadingIndex === -1) {
    failures.push(formatFailure(workspaceRoot, filePath, 1, 'library README must include a concrete Purpose section'));
    return;
  }

  const purposeLines = [];
  for (const item of lines.slice(purposeHeadingIndex + 1)) {
    if (/^\s{0,3}#{1,6}\s+/u.test(item.line)) break;
    if (item.line.trim()) purposeLines.push(item);
  }
  const purpose = purposeLines.map(({ line }) => line.trim()).join(' ');
  const purposeLine = purposeLines[0]?.lineNumber ?? lines[purposeHeadingIndex].lineNumber;
  if (purpose.length < 40 || genericLibraryPurposePattern.test(purpose)) {
    failures.push(
      formatFailure(
        workspaceRoot,
        filePath,
        purposeLine,
        'library purpose must describe concrete responsibilities, public API, or intended consumers',
      ),
    );
  }
}

function forEachMarkdownLineOutsideFences(content, callback) {
  let fence = null;
  for (const [index, line] of content.split(/\r?\n/u).entries()) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/u)?.[1];
    if (marker) {
      if (!fence) fence = { character: marker[0], length: marker.length };
      else if (marker[0] === fence.character && marker.length >= fence.length) fence = null;
      continue;
    }
    if (!fence) callback(line, index + 1);
  }
}

function collectMarkdownRecursively(workspaceRoot) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) visit(resolve(directory, entry.name));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(resolve(directory, entry.name));
      }
    }
  };
  visit(workspaceRoot);
  return files;
}

function readRootScripts(workspaceRoot) {
  const manifest = JSON.parse(readFileSync(resolve(workspaceRoot, 'package.json'), 'utf8'));
  return new Set(Object.keys(manifest.scripts ?? {}));
}

function normalizeMarkdownHref(rawHref) {
  const trimmed = rawHref.trim();
  const withoutTitle = trimmed.match(/^<([^>]+)>/u)?.[1] ?? trimmed.split(/\s+["']/u)[0] ?? '';
  return withoutTitle.replace(/^<|>$/gu, '');
}

function isExternalHref(href) {
  return /^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)/u.test(href);
}

function splitHref(href) {
  const index = href.indexOf('#');
  return index === -1 ? [href, ''] : [href.slice(0, index), href.slice(index + 1)];
}

function decodeHref(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getMarkdownAnchors(filePath, cache) {
  const cached = cache.get(filePath);
  if (cached) return cached;

  const anchors = new Set();
  const duplicateCounts = new Map();
  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/u)) {
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/u)?.[1];
    if (!heading) continue;
    const base = githubHeadingSlug(heading);
    const duplicate = duplicateCounts.get(base) ?? 0;
    duplicateCounts.set(base, duplicate + 1);
    anchors.add(duplicate === 0 ? base : `${base}-${duplicate}`);
  }
  for (const match of content.matchAll(/\b(?:id|name)=["']([^"']+)["']/gu)) {
    if (match[1]) anchors.add(match[1].toLowerCase());
  }
  cache.set(filePath, anchors);
  return anchors;
}

function githubHeadingSlug(heading) {
  return stripInlineHtml(heading)
    .toLowerCase()
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/[`*_~]/gu, '')
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .trim()
    .replace(/\s+/gu, '-');
}

function stripInlineHtml(value) {
  let result = '';
  let insideTag = false;

  for (const character of value) {
    if (character === '<') {
      insideTag = true;
      continue;
    }
    if (character === '>' && insideTag) {
      insideTag = false;
      continue;
    }
    if (!insideTag) result += character;
  }

  return result;
}

function lineNumber(content, position) {
  return content.slice(0, position).split('\n').length;
}

function formatFailure(workspaceRoot, filePath, line, message) {
  return `${relative(workspaceRoot, filePath)}:${line}: ${message}`;
}

function main() {
  const workspaceRoot = process.cwd();
  const result = validateWorkspace({ workspaceRoot });
  if (result.failures.length > 0) {
    process.stderr.write(`Documentation validation failed (${result.failures.length} issue(s)):\n`);
    for (const failure of result.failures) process.stderr.write(`- ${failure}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `Documentation validation passed: ${result.counts.files} tracked Markdown files, ${result.counts.links} local links, ${result.counts.anchors} anchors, ${result.counts.scripts} root-script references.\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
