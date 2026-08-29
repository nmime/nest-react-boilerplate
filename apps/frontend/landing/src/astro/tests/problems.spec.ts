// @vitest-environment node
// @requirements REQ-FRONTEND-SHELL-004
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ProblemTypeDefinitions,
  ProblemTypeDocumentationUrl,
  isProblemCode,
  problemTypeForCode,
} from '@app/common-problem-details';

/**
 * Contract for the landing app's `/problems` route — the human-readable RFC 9457
 * problem-type document that problem `type` URIs point at.
 *
 * The page (`src/astro/pages/problems.astro`, mapped to `/problems` by Astro's
 * static route rules) is a pure document: fixed head/landmark markup plus one
 * section per entry of the shared `ProblemTypeDefinitions` catalog. Full-page
 * rendering happens in the release browser sweep (acceptance matrix section F);
 * here we pin, without a build, (a) that the route exists at the configured
 * pages root, (b) that the shipped page source renders exactly that catalog
 * into that document, and (c) the data contract of every section it renders.
 */
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const astroConfigSource = readFileSync(join(appRoot, 'astro.config.mjs'), 'utf8');
const srcDirMatch = /srcDir:\s*['"](\.[^'"]+)['"]/u.exec(astroConfigSource);
const pagesRoot = resolve(appRoot, srcDirMatch?.[1] ?? '', 'pages');
const pagePath = join(pagesRoot, 'problems.astro');
const pageSource = existsSync(pagePath) ? readFileSync(pagePath, 'utf8') : '';

describe('landing /problems route', () => {
  it('is a real static route at the configured astro pages root', () => {
    expect(srcDirMatch, 'astro.config.mjs must declare a srcDir for the pages route map').toBeTruthy();
    // Astro maps <srcDir>/pages/problems.astro to the /problems route.
    expect(existsSync(pagePath), `expected page at ${pagePath}`).toBe(true);
  });

  it('pins the shipped document: language, title, meta, landmarks, and one section per problem type', () => {
    expect(pageSource).toContain('<!doctype html>');
    expect(pageSource).toContain('<html lang="en">');
    expect(pageSource).toContain('const title = "API problem types";');
    expect(pageSource).toContain('<title>{title}</title>');
    expect(pageSource).toContain(
      'content="Machine-readable definitions for this product\'s RFC 9457 API problem types."',
    );
    expect(pageSource).toContain('<meta name="viewport" content="width=device-width, initial-scale=1" />');
    expect(pageSource).toContain('<main>');
    expect(pageSource).toContain('<h1>API problem types</h1>');

    // The generic-error anchor section and the catalog-driven sections.
    expect(pageSource).toContain('<section id="about-blank">');
    expect(pageSource).toContain('<h2><code>about:blank</code></h2>');
    expect(pageSource).toContain('ProblemTypeDefinitions.map((problem) => (');
    expect(pageSource).toContain('<section id={problem.code}>');
    expect(pageSource).toContain('<code>{problemTypeForCode(problem.code)}</code>');

    // The documentation root is the shared constant, never a second hard-coded
    // URL that could drift from the type URIs served by the APIs.
    expect(pageSource).toContain('{ProblemTypeDocumentationUrl}');
    expect(pageSource).not.toMatch(/https?:\/\//u);
  });

  it('every rendered problem-type section has a resolvable URI and a complete contract', () => {
    expect(ProblemTypeDefinitions.length).toBeGreaterThan(1);
    const seenCodes = new Set<string>();
    for (const problem of ProblemTypeDefinitions) {
      expect(seenCodes.has(problem.code)).toBe(false);
      seenCodes.add(problem.code);
      expect(isProblemCode(problem.code)).toBe(true);
      expect(problem.status).toBeGreaterThanOrEqual(100);
      expect(problem.status).toBeLessThanOrEqual(599);
      expect(problem.detail.trim()).not.toBe('');
      expect(problem.resolution.trim()).not.toBe('');
      for (const extension of problem.extensions) {
        expect(extension.name.trim()).not.toBe('');
        expect(extension.description.trim()).not.toBe('');
      }

      const type = problemTypeForCode(problem.code);
      expect(type).toBe(`${ProblemTypeDocumentationUrl}#${problem.code}`);
      // The page renders this URI verbatim inside the section's <code> tag.
      expect(() => new URL(type)).not.toThrow();
    }
  });

  it('refuses malformed problem codes instead of emitting broken type URIs', () => {
    expect(() => problemTypeForCode('UPPER-CASE-ISH')).toThrow(TypeError);
    expect(() => problemTypeForCode('with space')).toThrow(TypeError);
    expect(() => problemTypeForCode('a'.repeat(65))).toThrow(TypeError);
    expect(() => problemTypeForCode('')).toThrow(TypeError);
    // The page derives every section from the validated catalog, so a code
    // that isProblemCode rejects can never reach the rendered document.
    expect(ProblemTypeDefinitions.every((problem) => isProblemCode(problem.code))).toBe(true);
  });
});
