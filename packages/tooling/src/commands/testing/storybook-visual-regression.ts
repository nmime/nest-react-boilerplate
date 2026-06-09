#!/usr/bin/env node
// @ts-nocheck
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, relative, resolve, sep } from "node:path";
import { spawn } from "node:child_process";

const outputDir = resolve("test-results/storybook-visual");
const storybookRoot = resolve("dist/storybook/frontend-ui");
const providedUrl = process.env.STORYBOOK_URL;
const dryRun = process.argv.includes("--dry-run");
const updateBaselines = process.env.UPDATE_VISUAL_BASELINES === "1" || process.argv.includes("--update-snapshots");
const projects = (process.env.VISUAL_PROJECTS ?? "chromium").split(",").map((item) => item.trim()).filter(Boolean);
const maxStories = Number(process.env.VISUAL_MAX_STORIES ?? 0);
const contentTypes = new Map([[".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"], [".json", "application/json; charset=utf-8"], [".map", "application/json; charset=utf-8"], [".png", "image/png"], [".svg", "image/svg+xml"], [".txt", "text/plain; charset=utf-8"], [".woff", "font/woff"], [".woff2", "font/woff2"]]);

function trim(value) {
  let out = value;
  while (out.startsWith("/") || out.startsWith(String.fromCharCode(92))) out = out.slice(1);
  return out;
}
function isInsideRoot(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !rel.includes(`..${sep}`));
}
async function createStaticServer(root) {
  if (!existsSync(root)) throw new Error(`Storybook build directory not found: ${root}. Run pnpm run storybook:build or set STORYBOOK_URL.`);
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    let filePath = join(root, trim(normalize(pathname)) || "index.html");
    if (!isInsideRoot(root, filePath)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = join(filePath, "index.html");
    if (!existsSync(filePath)) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, { "content-type": contentTypes.get(extname(filePath)) ?? "application/octet-stream" });
    createReadStream(filePath).pipe(response);
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to determine visual regression server address");
  return { url: `http://127.0.0.1:${address.port}`, close: async () => new Promise((resolveClose) => server.close(() => resolveClose())) };
}
async function discoverStories(baseUrl) {
  if (process.env.VISUAL_STORY_IDS) return process.env.VISUAL_STORY_IDS.split(",").map((id) => ({ id: id.trim(), title: id.trim(), name: id.trim() })).filter((item) => item.id);
  const response = await fetch(`${baseUrl}/index.json`);
  if (!response.ok) throw new Error(`Unable to read Storybook index: HTTP ${response.status}`);
  const index = await response.json();
  const entries = Object.values(index.entries ?? {}).filter((entry) => entry.type === "story" && !entry.tags?.includes("skip-visual"));
  const sorted = entries.sort((a, b) => a.id.localeCompare(b.id)).map((entry) => ({ id: entry.id, title: entry.title, name: entry.name }));
  return maxStories > 0 ? sorted.slice(0, maxStories) : sorted;
}
function writeGeneratedFiles(stories) {
  mkdirSync(outputDir, { recursive: true });
  const specPath = join(outputDir, "visual.generated.spec.mjs");
  const configPath = join(outputDir, "playwright.visual.config.mjs");
  const spec = [
    'import { test, expect } from "@playwright/test";',
    `const stories = ${JSON.stringify(stories, null, 2)};`,
    'const baseUrl = process.env.STORYBOOK_VISUAL_BASE_URL;',
    'for (const story of stories) {',
    '  test(story.id, async ({ page }) => {',
    '    await page.goto(`${baseUrl}/iframe.html?id=${story.id}&viewMode=story`, { waitUntil: "commit" });',
    '    const root = page.locator("#storybook-root, #root").first();',
    '    await expect(root).toBeVisible();',
    '    const screenshotName = `${story.id.replaceAll(/[^a-zA-Z0-9_-]+/g, "-")}.png`;',
    '    await expect(root).toHaveScreenshot(screenshotName, { animations: "disabled", maxDiffPixelRatio: Number(process.env.VISUAL_MAX_DIFF_PIXEL_RATIO ?? 0.01), threshold: Number(process.env.VISUAL_THRESHOLD ?? 0.2) });',
    '  });',
    '}',
    '',
  ].join("\n");
  writeFileSync(specPath, spec);
  const baselineDir = resolve("packages/tooling/baselines/visual/screenshots").replaceAll("\\", "/");
  const config = [
    'import { defineConfig, devices } from "@playwright/test";',
    'const all = {',
    '  chromium: { name: "chromium", use: { ...devices["Desktop Chrome"] } },',
    '  firefox: { name: "firefox", use: { ...devices["Desktop Firefox"] } },',
    '  webkit: { name: "webkit", use: { ...devices["Desktop Safari"] } },',
    '  "mobile-chrome": { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },',
    '  "mobile-safari": { name: "mobile-safari", use: { ...devices["iPhone 15"] } },',
    '};',
    `const selected = ${JSON.stringify(projects)};`,
    'export default defineConfig({',
    `  testDir: ${JSON.stringify(outputDir.replaceAll("\\", "/"))},`,
    '  timeout: 60000,',
    '  expect: { timeout: 10000 },',
    '  fullyParallel: false,',
    '  workers: 1,',
    '  reporter: [["list"], ["html", { outputFolder: "playwright-report/storybook-visual", open: "never" }]],',
    '  outputDir: "test-results/storybook-visual/artifacts",',
    `  snapshotPathTemplate: ${JSON.stringify(`${baselineDir}/{projectName}/{arg}{ext}`)},`,
    '  use: { trace: "retain-on-failure", screenshot: "only-on-failure", video: "retain-on-failure", reducedMotion: "reduce" },',
    '  projects: selected.map((name) => all[name]).filter(Boolean),',
    '});',
    '',
  ].join("\n");
  writeFileSync(configPath, config);
  return { specPath, configPath };
}

let staticServer;
try {
  let baseUrl = providedUrl;
  if (!baseUrl) {
    staticServer = await createStaticServer(storybookRoot);
    baseUrl = staticServer.url;
  }
  const stories = await discoverStories(baseUrl);
  if (!stories.length) throw new Error("No Storybook stories found for visual regression.");
  const generated = writeGeneratedFiles(stories);
  writeFileSync(join(outputDir, "manifest.json"), `${JSON.stringify({ baseUrl, stories, projects, updateBaselines }, null, 2)}\n`);
  if (dryRun) {
    console.log(JSON.stringify({ status: "dry-run", stories: stories.length, projects, manifest: join(outputDir, "manifest.json") }));
    process.exit(0);
  }
  const command = ["exec", "playwright", "test", "-c", generated.configPath, generated.specPath];
  if (updateBaselines) command.push("--update-snapshots");
  const child = spawn("pnpm", command, { stdio: "inherit", env: { ...process.env, STORYBOOK_VISUAL_BASE_URL: baseUrl } });
  process.exitCode = await new Promise((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  await staticServer?.close().catch(() => undefined);
}
