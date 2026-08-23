import { readFileSync } from "node:fs";
import { createServer, type RequestListener } from "node:http";
import { resolve } from "node:path";
import type {
  EndpointManifest,
  EndpointManifestRow,
} from "./endpoint-manifest.ts";
import {
  EndpointAuthClassifications,
  EndpointCoverageClassifications,
  EndpointKinds,
  EndpointSmokeClassifications,
  ProbedSmokeClassifications,
  StateChangingMethods,
  hasPathParameter,
  isExternallyReachable,
} from "./endpoint-manifest.ts";

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
  /**
   * rbac-allowed-denied rows whose allowed half could not be verified because
   * no session cookie was seeded (or captured). Reported explicitly: the
   * harness never silently shrinks its evidence.
   */
  rbacAllowedUnverified: number;
}

interface SmokeSession {
  cookies: Map<string, string>;
}

/**
 * The denied half of an `rbac-allowed-denied` probe. The session guard runs
 * before any resource lookup, so an anonymous request to a session-gated
 * route must be refused with 401 (no session) or 403 (tenant mismatch);
 * anything else means the guard is not protecting the route.
 */
export const RbacDeniedStatusClasses = ["401", "403"] as const;

/**
 * Path parameters are probed with a fixed sentinel UUID so the route is
 * exercised deterministically: the guard still runs first (denied half), and
 * with a valid session the handler answers 404 for the absent sentinel
 * resource — route alive, auth accepted — instead of a random 2xx/404.
 */
export const PathParameterSentinel = "00000000-0000-0000-0000-000000000000";

export function probePath(path: string): string {
  return path.replace(/:[A-Za-z_][A-Za-z0-9_]*/gu, PathParameterSentinel);
}

/**
 * Session cookies are seeded per origin from `<BASE_URL_ENV>` with the
 * `_BASE_URL` suffix replaced by `_SESSION_COOKIE` (e.g.
 * `ADMIN_API_BASE_URL` -> `ADMIN_API_SESSION_COOKIE`), taking a cookie-header
 * value. The value is used in requests only and never appears in output.
 */
export function sessionCookieEnvironment(baseUrlEnv: string): string {
  return `${baseUrlEnv.replace(/_BASE_URL$/u, "")}_SESSION_COOKIE`;
}

export async function runReleaseSmoke(
  options: ReleaseSmokeOptions,
): Promise<ReleaseSmokeResult> {
  const manifest = parseEndpointManifest(options.manifestPath);
  const environment = options.environment ?? process.env;
  const request = options.fetchImplementation ?? fetch;
  const output = options.output ?? ((line) => process.stdout.write(`${line}\n`));
  const sessions = new Map<string, SmokeSession>();
  const result: ReleaseSmokeResult = {
    executed: 0,
    skippedManual: 0,
    failed: 0,
    rbacAllowedUnverified: 0,
  };

  const missingSmoke = manifest.rows.filter(
    (row) => isExternallyReachable(row) && !row.smoke,
  );
  if (missingSmoke.length > 0) {
    throw new Error(
      `Refusing release smoke: externally reachable endpoints lack a smoke classification: ${missingSmoke
        .map((row) => `${row.project} ${row.method} ${row.path}`)
        .join(", ")}`,
    );
  }

  for (const row of manifest.rows) {
    if (!isExternallyReachable(row) || !row.smoke) continue;
    const label = `${row.project} ${row.method} ${redact(row.path)}`;
    const smoke = row.smoke;

    if ((StateChangingMethods as readonly string[]).includes(row.method)) {
      result.skippedManual += 1;
      output(`${label}: state-changing method ${row.method} is never probed by the release smoke`);
      continue;
    }
    if (!(ProbedSmokeClassifications as readonly string[]).includes(smoke.classification)) {
      result.skippedManual += 1;
      output(`${label}: not probed over HTTP (classification ${smoke.classification}); covered by its dedicated evidence`);
      continue;
    }

    const baseUrl = environment[smoke.baseUrlEnv]?.trim();
    if (!baseUrl) {
      throw new Error(
        `${smoke.baseUrlEnv} is required for ${row.project} ${redact(row.path)}.`,
      );
    }
    const session = sessionFor(sessions, baseUrl, environment);
    const url = endpointUrl(baseUrl, probePath(row.path));

    if (smoke.classification === "rbac-allowed-denied") {
      // Denied half: always probed, always anonymous (no cookie header).
      const denied = await request(url, {
        method: "GET",
        headers: {},
        redirect: "manual",
      });
      const deniedOk = matchesExpectedStatus(denied.status, RbacDeniedStatusClasses);
      if (!deniedOk) result.failed += 1;
      output(
        `${label} [anonymous] -> ${denied.status} ${
          deniedOk ? "ok (denied as expected)" : `UNEXPECTED (expected ${RbacDeniedStatusClasses.join("/")})`
        }`,
      );
      if (session.cookies.size > 0) {
        const allowed = await request(url, {
          method: "GET",
          headers: cookieHeaders(session),
          redirect: "manual",
        });
        const allowedOk = matchesExpectedStatus(allowed.status, smoke.expectedStatusClasses);
        if (!allowedOk) result.failed += 1;
        output(
          `${label} [session] -> ${allowed.status} ${
            allowedOk ? "ok (allowed as expected)" : `UNEXPECTED (expected ${smoke.expectedStatusClasses.join("/")})`
          }`,
        );
      } else {
        result.rbacAllowedUnverified += 1;
        output(
          `${label} [session] not verified: no session cookie seeded (${sessionCookieEnvironment(smoke.baseUrlEnv)} unset)`,
        );
      }
      result.executed += 1;
      continue;
    }

    const response = await request(url, {
      method: "GET",
      headers: cookieHeaders(session),
      redirect: "manual",
    });
    storeResponseCookies(session, response.headers);
    result.executed += 1;
    const matches = matchesExpectedStatus(response.status, smoke.expectedStatusClasses);
    if (!matches) result.failed += 1;
    output(
      `${label} -> ${response.status} ${
        matches ? "ok" : `UNEXPECTED (expected ${smoke.expectedStatusClasses.join("/")})`
      }`,
    );
  }

  if (result.failed > 0) {
    throw new Error(`${result.failed} release smoke probe(s) failed.`);
  }
  return result;
}

/**
 * Malformed manifest input is a hard failure: unreadable JSON, a wrong schema
 * version, a non-array rows list, or any row missing a required field (or
 * carrying an invalid classification) throws before a single request goes out.
 */
export function parseEndpointManifest(path: string): EndpointManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (error) {
    throw new Error(
      `Malformed endpoint manifest ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const manifest = parsed as EndpointManifest;
  if (manifest.schemaVersion !== 1) {
    throw new Error(`Malformed endpoint manifest ${path}: schemaVersion must be 1.`);
  }
  if (!Array.isArray(manifest.rows)) {
    throw new Error(`Malformed endpoint manifest ${path}: rows must be an array.`);
  }
  for (const [index, row] of manifest.rows.entries()) {
    validateManifestRow(index, row);
  }
  return manifest;
}

function validateManifestRow(index: number, row: EndpointManifestRow): void {
  const describe = (value: unknown): string => (value === undefined ? "missing" : JSON.stringify(value));
  for (const field of [
    "project",
    "kind",
    "method",
    "path",
    "source",
    "authClassification",
    "coverageClassification",
    "testEvidence",
  ] as const) {
    const value = (row as unknown as Record<string, unknown>)?.[field];
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`Malformed endpoint manifest row ${index} (${describe(row)}): ${field} must be a non-empty string.`);
    }
  }
  if (!(EndpointKinds as readonly string[]).includes(row.kind)) {
    throw new Error(`Malformed endpoint manifest row ${index} (${row.project} ${row.path}): unknown kind ${row.kind}.`);
  }
  if (!(EndpointAuthClassifications as readonly string[]).includes(row.authClassification)) {
    throw new Error(`Malformed endpoint manifest row ${index} (${row.project} ${row.path}): unknown authClassification ${row.authClassification}.`);
  }
  if (!(EndpointCoverageClassifications as readonly string[]).includes(row.coverageClassification)) {
    throw new Error(`Malformed endpoint manifest row ${index} (${row.project} ${row.path}): unknown coverageClassification ${row.coverageClassification}.`);
  }
  if (isExternallyReachable(row)) {
    const smoke = row.smoke;
    if (!smoke) {
      // Kept here for completeness; runReleaseSmoke refuses these upstream
      // with the row list.
      throw new Error(`Malformed endpoint manifest row ${index} (${row.project} ${row.path}): externally reachable row lacks a smoke classification.`);
    }
    if (!(EndpointSmokeClassifications as readonly string[]).includes(smoke.classification)) {
      throw new Error(`Malformed endpoint manifest row ${index} (${row.project} ${row.path}): unknown smoke classification ${smoke.classification}.`);
    }
    if (typeof smoke.baseUrlEnv !== "string" || smoke.baseUrlEnv.trim() === "") {
      throw new Error(`Malformed endpoint manifest row ${index} (${row.project} ${row.path}): smoke.baseUrlEnv must be a non-empty string.`);
    }
    if (
      !Array.isArray(smoke.expectedStatusClasses) ||
      smoke.expectedStatusClasses.length === 0 ||
      !smoke.expectedStatusClasses.every(
        (statusClass) =>
          typeof statusClass === "string" && /^\d(?:xx|\d\d)$/.test(statusClass),
      )
    ) {
      throw new Error(`Malformed endpoint manifest row ${index} (${row.project} ${row.path}): smoke.expectedStatusClasses must be a non-empty array of "2xx"-style or exact status classes.`);
    }
  }
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
  handler: RequestListener,
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

function sessionFor(
  sessions: Map<string, SmokeSession>,
  baseUrl: string,
  environment: NodeJS.ProcessEnv,
): SmokeSession {
  const origin = new URL(baseUrl).origin;
  const existing = sessions.get(origin);
  if (existing) return existing;
  const session: SmokeSession = { cookies: new Map<string, string>() };
  for (const [envName, value] of Object.entries(environment)) {
    if (!/_SESSION_COOKIE$/u.test(envName) || !value?.trim()) continue;
    const baseEnv = `${envName.replace(/_SESSION_COOKIE$/u, "")}_BASE_URL`;
    if (environment[baseEnv]?.trim() !== baseUrl) continue;
    for (const pair of value.split(";")) {
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      const cookieValue = pair.slice(separator + 1).trim();
      if (name && cookieValue) session.cookies.set(name, cookieValue);
    }
  }
  sessions.set(origin, session);
  return session;
}
