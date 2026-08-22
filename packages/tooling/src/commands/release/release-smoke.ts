import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import type {
  EndpointManifest,
  EndpointManifestRow,
} from "./endpoint-manifest.ts";
import { isExternallyReachable } from "./endpoint-manifest.ts";

export interface ReleaseSmokeOptions {
  manifestPath: string;
  environment?: NodeJS.ProcessEnv;
  fetchImplementation?: typeof fetch;
  output?: (line: string) => void;
}

export interface ReleaseSmokeResult {
  executed: number;
  skippedManual: number;
  failed: number;
}

interface SmokeSession {
  cookies: Map<string, string>;
}

export async function runReleaseSmoke(
  options: ReleaseSmokeOptions,
): Promise<ReleaseSmokeResult> {
  const manifest = parseEndpointManifest(options.manifestPath);
  const environment = options.environment ?? process.env;
  const request = options.fetchImplementation ?? fetch;
  const output = options.output ?? ((line) => process.stdout.write(`${line}\n`));
  const sessions = new Map<string, SmokeSession>();
  const result = { executed: 0, skippedManual: 0, failed: 0 };

  const missingSmoke = manifest.rows.filter(
    (row) => isExternallyReachable(row) && !row.smoke,
  );
  if (missingSmoke.length > 0) {
    throw new Error(
      `Externally reachable endpoints lack smoke classification: ${missingSmoke
        .map((row) => `${row.project} ${row.method} ${row.path}`)
        .join(", ")}`,
    );
  }

  for (const row of manifest.rows) {
    if (!isExternallyReachable(row) || !row.smoke) continue;
    if (
      ["delegated-runtime", "manual-fixture", "signed-provider"].includes(
        row.smoke.classification,
      )
    ) {
      result.skippedManual += 1;
      output(
        `${row.project} ${row.method} ${redact(row.path)}: classified ${row.smoke.classification}`,
      );
      continue;
    }
    const baseUrl = environment[row.smoke.baseUrlEnv]?.trim();
    if (!baseUrl) {
      throw new Error(
        `${row.smoke.baseUrlEnv} is required for ${row.project} ${row.path}.`,
      );
    }
    if (row.method !== "GET" && row.method !== "N/A") {
      result.skippedManual += 1;
      continue;
    }
    const session = sessionFor(sessions, baseUrl);
    const response = await request(endpointUrl(baseUrl, row.path), {
      method: "GET",
      headers: cookieHeaders(session),
      redirect: "manual",
    });
    storeResponseCookies(session, response.headers);
    result.executed += 1;
    const matches = matchesExpectedStatus(
      response.status,
      row.smoke.expectedStatusClasses,
    );
    if (!matches) result.failed += 1;
    output(
      `${row.project} GET ${redact(row.path)}: ${response.status} ${
        matches ? "ok" : "unexpected"
      }`,
    );
  }

  if (result.failed > 0) {
    throw new Error(`${result.failed} release smoke request(s) failed.`);
  }
  return result;
}

export function parseEndpointManifest(path: string): EndpointManifest {
  const parsed = JSON.parse(readFileSync(resolve(path), "utf8")) as EndpointManifest;
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.rows)) {
    throw new Error("Endpoint manifest must use schemaVersion 1 with a rows array.");
  }
  return parsed;
}

export function redact(value: string): string {
  try {
    const url = new URL(value, "https://redaction.invalid");
    for (const key of url.searchParams.keys()) {
      if (/token|secret|password|code|key|cookie|session/iu.test(key)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    return value.startsWith("http")
      ? url.toString()
      : `${url.pathname}${url.search}`;
  } catch {
    return value.replace(
      /((?:token|secret|password|code|key|cookie|session)=)[^&\s]+/giu,
      "$1[REDACTED]",
    );
  }
}

export function matchesExpectedStatus(
  status: number,
  expected: readonly string[],
): boolean {
  return expected.some((statusClass) => {
    if (/^\d{3}$/u.test(statusClass)) return status === Number(statusClass);
    const match = /^(\d)xx$/u.exec(statusClass);
    return match ? Math.floor(status / 100) === Number(match[1]) : false;
  });
}

export function storeResponseCookies(session: SmokeSession, headers: Headers): void {
  for (const cookie of headers.getSetCookie()) {
    const pair = cookie.split(";", 1)[0] ?? "";
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (value === "") session.cookies.delete(name);
    else session.cookies.set(name, value);
  }
}

export function cookieHeaders(session: SmokeSession): Headers {
  const headers = new Headers();
  if (session.cookies.size > 0) {
    headers.set(
      "cookie",
      [...session.cookies].map(([name, value]) => `${name}=${value}`).join("; "),
    );
  }
  return headers;
}

export async function withEphemeralSmokeServer<T>(
  handler: Parameters<typeof createServer>[0],
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = createServer(handler);
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Smoke test server did not bind.");
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolveClose, rejectClose) =>
      server.close((error) => (error ? rejectClose(error) : resolveClose())),
    );
  }
}

function endpointUrl(baseUrl: string, path: string): string {
  const url = new URL(baseUrl);
  const basePath = url.pathname.replace(/\/$/u, "");
  url.pathname = `${basePath}${path === "/" ? "/" : path}`.replace(/\/{2,}/gu, "/");
  url.search = "";
  return url.toString();
}

function sessionFor(sessions: Map<string, SmokeSession>, baseUrl: string): SmokeSession {
  const origin = new URL(baseUrl).origin;
  const existing = sessions.get(origin);
  if (existing) return existing;
  const session = { cookies: new Map<string, string>() };
  sessions.set(origin, session);
  return session;
}
