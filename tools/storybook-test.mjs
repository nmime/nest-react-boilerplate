import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, relative, resolve, sep } from "node:path";
import { spawn } from "node:child_process";

const root = resolve("dist/storybook/frontend-ui");
const port = Number(process.env.STORYBOOK_TEST_PORT ?? 0);

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

if (!existsSync(root)) {
  console.error(`Storybook build directory not found: ${root}`);
  process.exit(1);
}

const isInsideRoot = (candidate) => {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !rel.includes(`..${sep}`));
};

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  const pathname = decodeURIComponent(requestUrl.pathname);
  const normalized = trimLeadingSeparators(normalize(pathname));
  let filePath = join(root, normalized || "index.html");

  if (!isInsideRoot(filePath)) {
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

const closeServer = async () =>
  await new Promise((resolveClose) => {
    server.close(() => resolveClose());
  });

try {
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, "127.0.0.1", resolveListen);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to determine Storybook test server address");
  }

  const url = `http://127.0.0.1:${address.port}`;
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const child = spawn(
    pnpm,
    [
      "exec",
      "test-storybook",
      "--url",
      url,
      "--config-dir",
      "libs/frontend/ui/lib/.storybook",
    ],
    { stdio: "inherit" },
  );

  const exitCode = await new Promise((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("exit", (code) => resolveExit(code ?? 1));
  });

  await closeServer();
  process.exit(exitCode);
} catch (error) {
  await closeServer().catch(() => undefined);
  console.error(error);
  process.exit(1);
}
