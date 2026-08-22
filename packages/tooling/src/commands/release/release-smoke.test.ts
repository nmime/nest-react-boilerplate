// @requirements REQ-RUNTIME-DELIVERY-009
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { EndpointManifest } from "./endpoint-manifest.ts";
import {
  cookieHeaders,
  matchesExpectedStatus,
  redact,
  runReleaseSmoke,
  storeResponseCookies,
  withEphemeralSmokeServer,
} from "./release-smoke.ts";

describe("built-runtime release smoke", () => {
  it("matches exact and class-based statuses and redacts sensitive query values", () => {
    assert.equal(matchesExpectedStatus(204, ["2xx"]), true);
    assert.equal(matchesExpectedStatus(403, ["403"]), true);
    assert.equal(matchesExpectedStatus(500, ["2xx", "4xx"]), false);
    assert.equal(
      redact("/reset?token=secret&code=123&safe=value"),
      "/reset?token=%5BREDACTED%5D&code=%5BREDACTED%5D&safe=value",
    );
  });

  it("retains response cookies for later requests without logging cookie values", async () => {
    const session = { cookies: new Map<string, string>() };
    const responseHeaders = new Headers();
    responseHeaders.append("set-cookie", "sid=abc; Path=/; HttpOnly");
    storeResponseCookies(session, responseHeaders);
    assert.equal(cookieHeaders(session).get("cookie"), "sid=abc");

    await withEphemeralSmokeServer((request, response) => {
      if (request.url === "/login") {
        response.setHeader("set-cookie", "sid=server-cookie; Path=/; HttpOnly");
        response.end("ok");
        return;
      }
      response.statusCode = request.headers.cookie === "sid=server-cookie" ? 200 : 401;
      response.end("session");
    }, async (baseUrl) => {
      const manifest: EndpointManifest = {
        schemaVersion: 1,
        rows: [
          row("/login"),
          row("/protected", "cookie-session"),
        ],
      };
      const directory = mkdtempSync(join(tmpdir(), "release-smoke-"));
      try {
        const path = join(directory, "manifest.json");
        writeFileSync(path, JSON.stringify(manifest));
        const lines: string[] = [];
        const result = await runReleaseSmoke({
          manifestPath: path,
          environment: { LANDING_APP_BASE_URL: baseUrl },
          output: (line) => lines.push(line),
        });
        assert.deepEqual(result, { executed: 2, skippedManual: 0, failed: 0 });
        assert.equal(lines.join("\n").includes("server-cookie"), false);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  });

  it("refuses externally reachable rows without smoke classification", async () => {
    const directory = mkdtempSync(join(tmpdir(), "release-smoke-refusal-"));
    try {
      mkdirSync(directory, { recursive: true });
      const path = join(directory, "manifest.json");
      const manifest: EndpointManifest = {
        schemaVersion: 1,
        rows: [
          {
            project: "landing-app",
            kind: "frontend-route",
            method: "N/A",
            path: "/",
            source: "source.ts:1",
            authClassification: "public",
            coverageClassification: "covered-unit",
            testEvidence: "source.spec.ts:1",
          },
        ],
      };
      writeFileSync(path, JSON.stringify(manifest));
      await assert.rejects(
        () => runReleaseSmoke({ manifestPath: path }),
        /lack smoke classification/u,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function row(
  path: string,
  classification: "automatic" | "cookie-session" = "automatic",
): EndpointManifest["rows"][number] {
  return {
    project: "landing-app",
    kind: "frontend-route",
    method: "N/A",
    path,
    source: "source.ts:1",
    authClassification: classification === "automatic" ? "public" : "browser-session",
    coverageClassification: "covered-unit",
    testEvidence: "source.spec.ts:1",
    smoke: {
      baseUrlEnv: "LANDING_APP_BASE_URL",
      classification,
      expectedStatusClasses: ["2xx"],
    },
  };
}
