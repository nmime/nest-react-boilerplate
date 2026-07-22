#!/usr/bin/env node
/// <reference lib="dom" />
import { existsSync, readFileSync } from "node:fs";
import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { envList, parseArgs, writeJson } from "./runtime-utils.ts";

interface AxeViolation { id: string; impact: string | null; help: string; nodes: unknown[]; }
interface AxeResults { violations: AxeViolation[]; }
declare global {
  // axe-core is injected into the page via page.addScriptTag before it is read.
  // eslint-disable-next-line no-var
  var axe: { run: (context: Document, options: { resultTypes: string[] }) => Promise<AxeResults> };
}

const args = parseArgs();
const dryRun = args.flags.has("dry-run");
const out = args.options.get("report") ?? "test-results/accessibility/report.json";
const urls = envList("A11Y_URLS");
const profiles = envList("A11Y_PROFILES", ["desktop", "mobile"]);
const strictAxe = process.env.A11Y_STRICT_AXE !== "0";
const requireFromTooling = createRequire(import.meta.url);

if (dryRun) {
  writeJson(out, { status: "dry-run", urls, profiles, strictAxe });
  console.log(JSON.stringify({ status: "dry-run", preset: "accessibility", report: out }));
  process.exit(0);
}

function contentType(file: string): string {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js") || file.endsWith(".mjs")) {
    return "text/javascript; charset=utf-8";
  }
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".json")) return "application/json; charset=utf-8";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}

interface StaticServer { url: string; close: () => Promise<void>; }

async function serveDir(dir: string): Promise<StaticServer> {
  const root = resolve(dir);
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://127.0.0.1").pathname);
    const file = join(root, pathname === "/" ? "index.html" : pathname);
    if (!file.startsWith(root) || !existsSync(file)) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    res.setHeader("content-type", contentType(file));
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((resolveListen) => {
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to allocate accessibility server port.");
  return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolveClose) => { server.close(() => resolveClose()); }) };
}

function installedAxeCorePath(): string | undefined {
  try {
    return requireFromTooling.resolve("axe-core/axe.min.js");
  } catch {
    return undefined;
  }
}

function loadAxeSource(): string | null {
  const candidates = [process.env.AXE_CORE_PATH, installedAxeCorePath()].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) if (existsSync(candidate)) return readFileSync(candidate, "utf8");
  if (strictAxe) throw new Error("axe-core is required for accessibility checks. Restore the pinned @repo/tooling dependency or set AXE_CORE_PATH.");
  return null;
}

const defaultTargetDirs = [
  "dist/apps/frontend/admin",
  "dist/apps/frontend/app",
  "dist/apps/frontend/landing",
];
if (process.env.A11Y_INCLUDE_STORYBOOK === "1") {
  defaultTargetDirs.push("dist/storybook/frontend-ui-web");
}

const servers: StaticServer[] = [];
for (const dir of defaultTargetDirs) if (existsSync(join(dir, "index.html"))) {
  const server = await serveDir(dir);
  servers.push(server);
  urls.push(server.url);
}

if (!urls.length) {
  writeJson(out, {
    status: "skipped",
    reason: "No accessibility targets. Build apps/storybook or set A11Y_URLS to enforce accessibility checks.",
    urls,
    profiles,
  });
  console.log(JSON.stringify({
    status: "skipped",
    preset: "accessibility",
    reason: "No A11Y_URLS or built app/storybook targets",
    report: out,
  }));
  process.exit(0);
}

const { chromium, devices } = await import("@playwright/test");
const axeSource = loadAxeSource();
const browser = await chromium.launch();
const profileConfig: Record<string, Parameters<typeof browser.newContext>[0]> = { desktop: { viewport: { width: 1440, height: 1000 } }, mobile: devices["Pixel 7"] };
const results: Record<string, unknown>[] = [];
try {
  for (const url of urls) for (const profile of profiles) {
    const context = await browser.newContext(profileConfig[profile] ?? profileConfig.desktop);
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    const semantic = await page.evaluate(() => {
      const visibleText = (element: Element): string => element.textContent?.trim() || element.getAttribute("aria-label") || element.getAttribute("title") || "";
      return { title: document.title, lang: document.documentElement.lang, landmarks: document.querySelectorAll("main,nav,header,footer,aside,[role='main'],[role='navigation']").length, headings: document.querySelectorAll("h1,h2,h3,h4,h5,h6").length, imagesWithoutAlt: [...document.images].filter((img) => !img.hasAttribute("alt")).length, unlabeledInputs: [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input,select,textarea")].filter((el) => !el.labels?.length && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby")).length, unnamedButtons: [...document.querySelectorAll("button,[role='button'],a[href]")].filter((el) => !visibleText(el)).length };
    });
    let axeViolations = null;
    if (axeSource) {
      await page.addScriptTag({ content: axeSource });
      const axe = await page.evaluate(() => globalThis.axe.run(document, { resultTypes: ["violations"] }));
      axeViolations = axe.violations.map((violation) => ({ id: violation.id, impact: violation.impact, help: violation.help, nodes: violation.nodes.length }));
    }
    const ok = Boolean(semantic.title) && Boolean(semantic.lang) && semantic.headings > 0 && semantic.imagesWithoutAlt === 0 && semantic.unlabeledInputs === 0 && semantic.unnamedButtons === 0 && (!axeViolations || axeViolations.length === 0);
    results.push({ url, profile, semantic, axeViolations, ok });
    await context.close();
  }
} finally {
  await browser.close();
  for (const server of servers) await server.close();
}

const failed = results.some((result) => !result.ok);
writeJson(out, { status: failed ? "violations" : "ok", profiles, results });
console.log(JSON.stringify({ status: failed ? "violations" : "ok", targets: urls.length, profiles: profiles.length, report: out }));
if (failed) process.exit(1);
