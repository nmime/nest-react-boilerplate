#!/usr/bin/env node
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';

const workspaceRoot = resolve('.');
const outputDir = resolve(workspaceRoot, 'test-results/storybook-visual');
const reportDir = resolve(workspaceRoot, 'playwright-report/storybook-visual');
const baselineRoot = resolve(workspaceRoot, 'packages/tooling/baselines/visual/screenshots');
const baselinePlatform = process.platform;
const storybookRoot = resolve(workspaceRoot, 'dist/storybook/frontend-ui-web');
const providedUrl = process.env.STORYBOOK_URL;
const dryRun = process.argv.includes('--dry-run');
const updateBaselines =
  process.env.UPDATE_VISUAL_BASELINES === '1' || process.argv.includes('--update-snapshots');
const supportedProjects = ['chromium', 'firefox', 'webkit', 'mobile-chrome', 'mobile-safari'] as const;
const projects = readListOption('--projects', process.env.VISUAL_PROJECTS ?? 'chromium');
const selectedStoryIds = readListOption('--stories', process.env.VISUAL_STORY_IDS ?? '');
const maxStories = readNumber('VISUAL_MAX_STORIES', process.env.VISUAL_MAX_STORIES ?? '0', {
  integer: true,
  maximum: Number.MAX_SAFE_INTEGER,
  minimum: 0,
});
const maxDiffPixelRatio = readNumber(
  'VISUAL_MAX_DIFF_PIXEL_RATIO',
  process.env.VISUAL_MAX_DIFF_PIXEL_RATIO ?? '0.001',
  { maximum: 1, minimum: 0 },
);
const threshold = readNumber('VISUAL_THRESHOLD', process.env.VISUAL_THRESHOLD ?? '0.15', {
  maximum: 1,
  minimum: 0,
});
const testTimeout = readNumber('VISUAL_TEST_TIMEOUT_MS', process.env.VISUAL_TEST_TIMEOUT_MS ?? '60000', {
  integer: true,
  maximum: 600_000,
  minimum: 10_000,
});
const expectTimeout = readNumber('VISUAL_EXPECT_TIMEOUT_MS', process.env.VISUAL_EXPECT_TIMEOUT_MS ?? '15000', {
  integer: true,
  maximum: testTimeout,
  minimum: 1_000,
});
const workers = readNumber('VISUAL_WORKERS', process.env.VISUAL_WORKERS ?? '1', {
  integer: true,
  maximum: 8,
  minimum: 1,
});
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

interface Story {
  hasPlayFunction: boolean;
  id: string;
  name: string;
  title: string;
}

interface StaticServer {
  close: () => Promise<void>;
  url: string;
}

interface StorybookIndexEntry {
  id: string;
  name: string;
  tags?: string[];
  title: string;
  type?: string;
}

function readArgument(name: string): string | undefined {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readListOption(name: string, fallback: string): string[] {
  return (readArgument(name) ?? fallback)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function readNumber(
  name: string,
  rawValue: string,
  options: { integer?: boolean; maximum: number; minimum: number },
): number {
  const value = Number(rawValue);
  if (
    !Number.isFinite(value) ||
    (options.integer && !Number.isInteger(value)) ||
    value < options.minimum ||
    value > options.maximum
  ) {
    throw new Error(
      `${name} must be ${options.integer ? 'an integer ' : ''}between ${options.minimum} and ${options.maximum}.`,
    );
  }
  return value;
}

function validateOptions(): void {
  if (!projects.length) throw new Error('At least one visual project is required.');
  if (new Set(projects).size !== projects.length) {
    throw new Error('Visual projects must not contain duplicates.');
  }
  const unknownProjects = projects.filter(
    (project) => !(supportedProjects as readonly string[]).includes(project),
  );
  if (unknownProjects.length) {
    throw new Error(
      `Unknown visual project(s): ${unknownProjects.join(', ')}. Supported projects: ${supportedProjects.join(', ')}.`,
    );
  }
  if (updateBaselines && process.env.CI && process.env.VISUAL_ALLOW_CI_UPDATE !== '1') {
    throw new Error(
      'Visual baseline updates are disabled in CI. Review and update them locally, or set VISUAL_ALLOW_CI_UPDATE=1 for an explicit maintenance run.',
    );
  }
}

function trimLeadingSeparators(value: string): string {
  let out = value;
  while (out.startsWith('/') || out.startsWith(String.fromCharCode(92))) out = out.slice(1);
  return out;
}

function isInsideRoot(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !rel.includes(`..${sep}`));
}

async function createStaticServer(root: string): Promise<StaticServer> {
  if (!existsSync(root)) {
    throw new Error(
      `Storybook build directory not found: ${root}. Run pnpm run storybook:build or set STORYBOOK_URL.`,
    );
  }
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    let filePath = join(root, trimLeadingSeparators(normalize(pathname)) || 'index.html');
    if (!isInsideRoot(root, filePath)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = join(filePath, 'index.html');
    if (!existsSync(filePath)) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, {
      'content-type': contentTypes.get(extname(filePath)) ?? 'application/octet-stream',
    });
    createReadStream(filePath).pipe(response);
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => resolveListen());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to determine visual regression server address');
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () =>
      new Promise<void>((resolveClose) => {
        server.close(() => resolveClose());
      }),
  };
}

async function discoverStories(baseUrl: string): Promise<Story[]> {
  const response = await fetch(`${baseUrl}/index.json`);
  if (!response.ok) throw new Error(`Unable to read Storybook index: HTTP ${response.status}`);
  const index: { entries?: Record<string, StorybookIndexEntry> } = await response.json();
  const requested = new Set(selectedStoryIds);
  const entries = Object.values(index.entries ?? {}).filter(
    (entry) =>
      entry.type === 'story' &&
      entry.tags?.includes('visual') &&
      !entry.tags.includes('skip-visual') &&
      (!requested.size || requested.has(entry.id)),
  );
  const foundIds = new Set(entries.map((entry) => entry.id));
  const missingIds = selectedStoryIds.filter((id) => !foundIds.has(id));
  if (missingIds.length) {
    throw new Error(`Requested visual story id(s) not found or not tagged visual: ${missingIds.join(', ')}.`);
  }
  const sorted = entries
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((entry) => ({
      hasPlayFunction: entry.tags?.includes('play-fn') ?? false,
      id: entry.id,
      title: entry.title,
      name: entry.name,
    }));
  return maxStories > 0 ? sorted.slice(0, maxStories) : sorted;
}

function screenshotName(story: Story): string {
  return `${story.id.replaceAll(/[^a-zA-Z0-9_-]+/g, '-')}.png`;
}

function baselineDirectory(project: string): string {
  return join(baselineRoot, baselinePlatform, project);
}

function assertBaselinesExist(stories: Story[]): void {
  if (dryRun || updateBaselines) return;
  const expected = new Set(stories.map(screenshotName));
  const missing = projects.flatMap((project) =>
    stories
      .map((story) => join(baselineDirectory(project), screenshotName(story)))
      .filter((filePath) => !existsSync(filePath)),
  );
  if (missing.length) {
    throw new Error(
      `Missing ${missing.length} reviewed visual baseline(s) for ${baselinePlatform}. Run pnpm run test:visual:update in the intended baseline environment, review the PNG changes, then rerun the check.\n${missing.join('\n')}`,
    );
  }
  if (selectedStoryIds.length || maxStories > 0) return;
  const stale = projects.flatMap((project) => {
    const directory = baselineDirectory(project);
    if (!existsSync(directory)) return [];
    return readdirSync(directory)
      .filter((fileName) => fileName.endsWith('.png') && !expected.has(fileName))
      .map((fileName) => join(directory, fileName));
  });
  if (stale.length) {
    throw new Error(
      `Found ${stale.length} stale visual baseline(s) for ${baselinePlatform}. Run the matching visual update command, review the removals, then rerun the check.\n${stale.join('\n')}`,
    );
  }
}

function removeStaleBaselines(stories: Story[]): void {
  if (!updateBaselines || selectedStoryIds.length || maxStories > 0) return;
  const expected = new Set(stories.map(screenshotName));
  for (const project of projects) {
    const directory = baselineDirectory(project);
    if (!existsSync(directory)) continue;
    for (const fileName of readdirSync(directory)) {
      if (fileName.endsWith('.png') && !expected.has(fileName)) unlinkSync(join(directory, fileName));
    }
  }
}

function writeGeneratedFiles(stories: Story[]): { configPath: string; specPath: string } {
  mkdirSync(outputDir, { recursive: true });
  const specPath = join(outputDir, 'visual.generated.spec.mjs');
  const configPath = join(outputDir, 'playwright.visual.config.mjs');
  const spec = [
    'import { test, expect } from "@playwright/test";',
    `const stories = ${JSON.stringify(stories, null, 2)};`,
    'const baseUrl = process.env.STORYBOOK_VISUAL_BASE_URL;',
    'const visualStyle = `',
    '@font-face { font-family: "NRB Visual Sans"; font-style: normal; font-weight: 400; src: url("/nunito-sans-regular.woff2") format("woff2"); }',
    '@font-face { font-family: "NRB Visual Sans"; font-style: normal; font-weight: 700; src: url("/nunito-sans-bold.woff2") format("woff2"); }',
    'html, body, body * { font-family: "NRB Visual Sans", sans-serif !important; }',
    '*, *::before, *::after { caret-color: transparent !important; scroll-behavior: auto !important; }',
    '`;',
    'for (const story of stories) {',
    '  test(story.id, async ({ page }) => {',
    '    await page.clock.setFixedTime(new Date("2025-01-15T12:00:00.000Z"));',
    '    await page.addInitScript(() => { Math.random = () => 0.3141592653589793; });',
    '    await page.goto(`${baseUrl}/iframe.html?id=${story.id}&viewMode=story`, { waitUntil: "domcontentloaded" });',
    '    await page.addStyleTag({ content: visualStyle });',
    '    const root = page.locator("#storybook-root, #root").first();',
    '    await expect(root).toBeVisible();',
    '    if (story.hasPlayFunction) {',
    '      await page.locator("html[data-visual-ready=true]").waitFor({ state: "attached" });',
    '    }',
    '    await page.evaluate(async () => {',
    '      await document.fonts.ready;',
    '      await Promise.all(Array.from(document.images, (image) => image.complete ? undefined : new Promise((resolve) => { image.addEventListener("load", resolve, { once: true }); image.addEventListener("error", resolve, { once: true }); })));',
    '      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));',
    '    });',
    '    const name = `${story.id.replaceAll(/[^a-zA-Z0-9_-]+/g, "-")}.png`;',
    `    await expect(page).toHaveScreenshot(name, { animations: "disabled", caret: "hide", fullPage: true, maxDiffPixelRatio: ${maxDiffPixelRatio}, scale: "css", threshold: ${threshold} });`,
    '  });',
    '}',
    '',
  ].join('\n');
  writeFileSync(specPath, spec);
  const config = [
    'import { defineConfig, devices } from "@playwright/test";',
    'const deterministic = { colorScheme: "light", locale: "en-US", reducedMotion: "reduce", serviceWorkers: "block", timezoneId: "UTC" };',
    'const all = {',
    '  chromium: { name: "chromium", use: { ...devices["Desktop Chrome"], ...deterministic } },',
    '  firefox: { name: "firefox", use: { ...devices["Desktop Firefox"], ...deterministic } },',
    '  webkit: { name: "webkit", use: { ...devices["Desktop Safari"], ...deterministic } },',
    '  "mobile-chrome": { name: "mobile-chrome", use: { ...devices["Pixel 7"], ...deterministic } },',
    '  "mobile-safari": { name: "mobile-safari", use: { ...devices["iPhone 15"], ...deterministic } },',
    '};',
    `const selected = ${JSON.stringify(projects)};`,
    'export default defineConfig({',
    `  testDir: ${JSON.stringify(outputDir.replaceAll('\\', '/'))},`,
    `  timeout: ${testTimeout},`,
    `  expect: { timeout: ${expectTimeout} },`,
    `  fullyParallel: ${workers > 1},`,
    `  workers: ${workers},`,
    '  retries: process.env.CI ? 1 : 0,',
    `  reporter: [["list"], ["html", { outputFolder: ${JSON.stringify(reportDir.replaceAll('\\', '/'))}, open: "never" }]],`,
    `  outputDir: ${JSON.stringify(join(outputDir, 'artifacts').replaceAll('\\', '/'))},`,
    `  snapshotPathTemplate: ${JSON.stringify(`${baselineRoot.replaceAll('\\', '/')}/${baselinePlatform}/{projectName}/{arg}{ext}`)},`,
    '  use: { screenshot: "only-on-failure", trace: "retain-on-failure", video: "retain-on-failure" },',
    '  projects: selected.map((name) => all[name]),',
    '});',
    '',
  ].join('\n');
  writeFileSync(configPath, config);
  return { specPath, configPath };
}

validateOptions();
let staticServer: StaticServer | undefined;
try {
  let baseUrl = providedUrl;
  if (!baseUrl) {
    staticServer = await createStaticServer(storybookRoot);
    baseUrl = staticServer.url;
  }
  const stories = await discoverStories(baseUrl);
  if (!stories.length) {
    throw new Error('No stories tagged visual were found in the Storybook index.');
  }
  assertBaselinesExist(stories);
  const generated = writeGeneratedFiles(stories);
  const manifestPath = join(outputDir, 'manifest.json');
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        baselinePlatform,
        baselineRoot,
        baseUrl,
        maxDiffPixelRatio,
        projects,
        stories,
        testTimeout,
        threshold,
        updateBaselines,
        workers,
      },
      null,
      2,
    )}\n`,
  );
  if (dryRun) {
    console.log(
      JSON.stringify({
        baselinePlatform,
        manifest: manifestPath,
        projects,
        status: 'dry-run',
        stories: stories.length,
      }),
    );
    process.exit(0);
  }
  const command = ['exec', 'playwright', 'test', '-c', generated.configPath, generated.specPath];
  if (updateBaselines) command.push('--update-snapshots');
  const packageManagerPath = process.env.npm_execpath;
  const child = spawn(packageManagerPath ? process.execPath : 'pnpm', packageManagerPath ? [packageManagerPath, ...command] : command, {
    stdio: 'inherit',
    env: { ...process.env, STORYBOOK_VISUAL_BASE_URL: baseUrl },
  });
  const exitCode = await new Promise<number>((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('exit', (code) => resolveExit(code ?? 1));
  });
  process.exitCode = exitCode;
  if (exitCode === 0) removeStaleBaselines(stories);
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  await staticServer?.close().catch(() => undefined);
}
