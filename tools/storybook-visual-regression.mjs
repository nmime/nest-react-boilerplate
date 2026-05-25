import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, relative, resolve, sep } from "node:path";

import { chromium } from "@playwright/test";

const storyIds = [
  "components-uibutton--primary",
  "components-uibutton--secondary-link",
];
const baselinePath = resolve("tools/visual-baselines/storybook-ui.json");
const outputDir = resolve("test-results/storybook-visual");
const updateBaselines = process.env.UPDATE_VISUAL_BASELINES === "1";
const storybookRoot = resolve("dist/storybook/frontend-ui");
const providedUrl = process.env.STORYBOOK_URL;

const trimLeadingSeparators = (value) => {
  let output = value;

  while (output.startsWith("/") || output.startsWith(String.fromCharCode(92))) {
    output = output.slice(1);
  }

  return output;
};

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

const hashBuffer = (buffer) =>
  createHash("sha256").update(buffer).digest("hex");

const readBaselines = () => {
  if (!existsSync(baselinePath)) {
    return {};
  }

  return JSON.parse(readFileSync(baselinePath, "utf-8"));
};

const isInsideRoot = (root, candidate) => {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !rel.includes(`..${sep}`));
};

const createStaticServer = async (root) => {
  if (!existsSync(root)) {
    throw new Error(`Storybook build directory not found: ${root}`);
  }

  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(requestUrl.pathname);
    const normalized = trimLeadingSeparators(normalize(pathname));
    let filePath = join(root, normalized || "index.html");

    if (!isInsideRoot(root, filePath)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      filePath = join(filePath, "index.html");
    }

    if (!existsSync(filePath)) {
      response.writeHead(404).end("Not found");
      return;
    }

    response.writeHead(200, {
      "content-type":
        contentTypes.get(extname(filePath)) ?? "application/octet-stream",
    });
    createReadStream(filePath).pipe(response);
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to determine visual regression server address");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () =>
      await new Promise((resolveClose) => {
        server.close(() => resolveClose());
      }),
  };
};

const captureStory = async (page, baseUrl, storyId) => {
  await page.goto(`${baseUrl}/iframe.html?id=${storyId}&viewMode=story`, {
    waitUntil: "networkidle",
  });
  await page.locator("#storybook-root").waitFor({ state: "visible" });
  return await page.screenshot({ fullPage: false });
};

let browser;
let staticServer;
let exitCode = 0;

try {
  mkdirSync(outputDir, { recursive: true });
  let baseUrl = providedUrl;

  if (!baseUrl) {
    staticServer = await createStaticServer(storybookRoot);
    baseUrl = staticServer.url;
  }

  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });

  const baselines = readBaselines();
  const nextBaselines = {};
  const failures = [];

  for (const storyId of storyIds) {
    const screenshot = await captureStory(page, baseUrl, storyId);
    const actual = {
      sha256: hashBuffer(screenshot),
      byteLength: screenshot.byteLength,
    };
    nextBaselines[storyId] = actual;

    const baseline = baselines[storyId];
    if (!updateBaselines && !baseline) {
      failures.push(`${storyId}: missing baseline`);
      writeFileSync(join(outputDir, `${storyId}.missing.png`), screenshot);
      continue;
    }

    if (
      !updateBaselines &&
      (baseline.sha256 !== actual.sha256 ||
        baseline.byteLength !== actual.byteLength)
    ) {
      failures.push(
        `${storyId}: expected ${baseline.sha256}/${baseline.byteLength}, got ${actual.sha256}/${actual.byteLength}`,
      );
      writeFileSync(join(outputDir, `${storyId}.mismatch.png`), screenshot);
    }
  }

  if (updateBaselines) {
    mkdirSync(resolve("tools/visual-baselines"), { recursive: true });
    writeFileSync(baselinePath, `${JSON.stringify(nextBaselines, null, 2)}\n`);
    console.log(`Updated Storybook visual baselines at ${baselinePath}`);
  } else if (failures.length > 0) {
    console.error(failures.join("\n"));
    exitCode = 1;
  } else {
    console.log("Storybook visual baselines match.");
  }
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  if (browser) {
    await browser.close().catch(() => undefined);
  }

  if (staticServer) {
    await staticServer.close().catch(() => undefined);
  }
}

process.exit(exitCode);
