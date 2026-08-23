// @requirements REQ-RUNTIME-DELIVERY-009
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { EndpointManifest, EndpointManifestRow } from "./endpoint-manifest.ts";
import {
  RbacDeniedStatusClasses,
  cookieHeaders,
  matchesExpectedStatus,
  parseEndpointManifest,
  probePath,
  redact,
  runReleaseSmoke,
  sessionCookieEnvironment,
  storeResponseCookies,
  withEphemeralSmokeServer,
} from "./release-smoke.ts";

describe("built-runtime release smoke", () => {
  it("matches exact and class-based statuses and redacts sensitive query values", () => {
    assert.equal(matchesExpectedStatus(204, ["2xx"]), true);
    assert.equal(matchesExpectedStatus(403, ["403"]), true);
    assert.equal(matchesExpectedStatus(500, ["2xx", "4xx"]), false);
    assert.equal(matchesExpectedStatus(302, ["2xx", "3xx"]), true);
    assert.equal(matchesExpectedStatus(404, ["2xx", "404"]), true);
    assert.equal(
      redact("/reset?token=secret&code=123&safe=value"),
      "/reset?token=%5BREDACTED%5D&code=%5BREDACTED%5D&safe=value",
    );
    assert.equal(
      redact("/profile?session=abc123&name=ok"),
      "/profile?session=%5BREDACTED%5D&name=ok",
    );
  });

  it("replaces path parameters with the deterministic sentinel", () => {
    assert.equal(probePath("/admin/audit/:id"), "/admin/audit/00000000-0000-0000-0000-000000000000");
    assert.equal(probePath("/users/:userId/preferences"), "/users/00000000-0000-0000-0000-000000000000/preferences");
    assert.equal(probePath("/plain/path"), "/plain/path");
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
          automaticRow("/login"),
          automaticRow("/protected"),
        ],
      };
      const path = writeManifest(manifest);
      try {
        const lines: string[] = [];
        const result = await runReleaseSmoke({
          manifestPath: path,
          environment: { LANDING_APP_BASE_URL: baseUrl },
          output: (line) => lines.push(line),
        });
        assert.deepEqual(result, { executed: 2, skippedManual: 0, failed: 0, rbacAllowedUnverified: 0 });
        assert.equal(lines.join("\n").includes("server-cookie"), false);
      } finally {
        rmSync(path, { force: true });
      }
    });
  });

  it("verifies the rbac denied half anonymously and the allowed half with the seeded session cookie", async () => {
    await withEphemeralSmokeServer((request, response) => {
      const hasCookie = request.headers.cookie === "session=admin-session";
      if (request.url === "/admin/roles") {
        response.statusCode = hasCookie ? 200 : 401;
        response.end("roles");
        return;
      }
      response.statusCode = 500;
      response.end("unrouted");
    }, async (baseUrl) => {
      const manifest: EndpointManifest = {
        schemaVersion: 1,
        rows: [
          {
            project: "landing-app",
            kind: "http",
            method: "GET",
            path: "/admin/roles",
            source: "source.ts:1",
            authClassification: "session-rbac",
            coverageClassification: "covered-unit",
            testEvidence: "source.spec.ts:1",
            smoke: {
              baseUrlEnv: "LANDING_APP_BASE_URL",
              classification: "rbac-allowed-denied",
              expectedStatusClasses: ["2xx"],
            },
          },
        ],
      };
      const path = writeManifest(manifest);
      try {
        const lines: string[] = [];
        const result = await runReleaseSmoke({
          manifestPath: path,
          environment: {
            LANDING_APP_BASE_URL: baseUrl,
            [sessionCookieEnvironment("LANDING_APP_BASE_URL")]: "session=admin-session",
          },
          output: (line) => lines.push(line),
        });
        assert.deepEqual(result, { executed: 1, skippedManual: 0, failed: 0, rbacAllowedUnverified: 0 });
        const report = lines.join("\n");
        assert.match(report, /\[anonymous\] -> 401 ok \(denied as expected\)/u);
        assert.match(report, /\[session\] -> 200 ok \(allowed as expected\)/u);
        assert.equal(report.includes("admin-session"), false, "session cookie values must never reach output");
      } finally {
        rmSync(path, { force: true });
      }
    });
  });

  it("fails loudly when an anonymous probe to a session-gated route is not denied", async () => {
    await withEphemeralSmokeServer((_request, response) => {
      response.statusCode = 200;
      response.end("should have been 401");
    }, async (baseUrl) => {
      const manifest: EndpointManifest = {
        schemaVersion: 1,
        rows: [rbacRow("/admin/roles")],
      };
      const path = writeManifest(manifest);
      try {
        const lines: string[] = [];
        await assert.rejects(
          () =>
            runReleaseSmoke({
              manifestPath: path,
              environment: { LANDING_APP_BASE_URL: baseUrl },
              output: (line) => lines.push(line),
            }),
          /release smoke probe\(s\) failed/u,
        );
        assert.match(lines.join("\n"), /UNEXPECTED \(expected 401\/403\)/u);
      } finally {
        rmSync(path, { force: true });
      }
    });
  });

  it("probes parameterized routes with the sentinel id and accepts the 404 allowed half", async () => {
    const seenPaths: string[] = [];
    await withEphemeralSmokeServer((request, response) => {
      seenPaths.push(request.url ?? "");
      const hasCookie = request.headers.cookie === "session=admin-session";
      response.statusCode = hasCookie ? 404 : 401;
      response.end("sentinel probe");
    }, async (baseUrl) => {
      const manifest: EndpointManifest = {
        schemaVersion: 1,
        rows: [
          {
            ...rbacRow("/admin/audit/:id"),
            smoke: {
              baseUrlEnv: "LANDING_APP_BASE_URL",
              classification: "rbac-allowed-denied",
              expectedStatusClasses: ["2xx", "404"],
            },
          },
        ],
      };
      const path = writeManifest(manifest);
      try {
        const result = await runReleaseSmoke({
          manifestPath: path,
          environment: {
            LANDING_APP_BASE_URL: baseUrl,
            [sessionCookieEnvironment("LANDING_APP_BASE_URL")]: "session=admin-session",
          },
        });
        assert.equal(result.failed, 0);
        assert.deepEqual(seenPaths, [
          "/admin/audit/00000000-0000-0000-0000-000000000000",
          "/admin/audit/00000000-0000-0000-0000-000000000000",
        ]);
      } finally {
        rmSync(path, { force: true });
      }
    });
  });

  it("counts rbac rows whose allowed half is unverified instead of skipping them silently", async () => {
    await withEphemeralSmokeServer((_request, response) => {
      response.statusCode = 401;
      response.end("anonymous only");
    }, async (baseUrl) => {
      const manifest: EndpointManifest = { schemaVersion: 1, rows: [rbacRow("/admin/roles")] };
      const path = writeManifest(manifest);
      try {
        const lines: string[] = [];
        const result = await runReleaseSmoke({
          manifestPath: path,
          environment: { LANDING_APP_BASE_URL: baseUrl },
          output: (line) => lines.push(line),
        });
        assert.equal(result.rbacAllowedUnverified, 1);
        assert.match(
          lines.join("\n"),
          /not verified: no session cookie seeded \(LANDING_APP_SESSION_COOKIE unset\)/u,
        );
      } finally {
        rmSync(path, { force: true });
      }
    });
  });

  it("refuses externally reachable rows without smoke classification", async () => {
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
    const path = writeManifest(manifest);
    try {
      await assert.rejects(
        () => runReleaseSmoke({ manifestPath: path }),
        /lacks? a smoke classification/u,
      );
    } finally {
      rmSync(path, { force: true });
    }
  });

  it("hard-fails on malformed manifest input before any request", async () => {
    const directory = mkdtempSync(join(tmpdir(), "release-smoke-malformed-"));
    try {
      const base = join(directory, "manifest.json");

      writeFileSync(base, "{ not json");
      assert.throws(
        () => parseEndpointManifest(base),
        /Malformed endpoint manifest .*(Expected property name|not valid JSON|Unexpected token)/u,
      );

      writeFileSync(base, JSON.stringify({ schemaVersion: 2, rows: [] }));
      assert.throws(() => parseEndpointManifest(base), /schemaVersion must be 1/u);

      writeFileSync(base, JSON.stringify({ schemaVersion: 1, rows: "nope" }));
      assert.throws(() => parseEndpointManifest(base), /rows must be an array/u);

      writeFileSync(base, JSON.stringify({ schemaVersion: 1, rows: [{ ...automaticRow("/x"), path: "" }] }));
      assert.throws(() => parseEndpointManifest(base), /path must be a non-empty string/u);

      writeFileSync(
        base,
        JSON.stringify({
          schemaVersion: 1,
          rows: [{ ...automaticRow("/x"), kind: "carrier-pigeon" }],
        }),
      );
      assert.throws(() => parseEndpointManifest(base), /unknown kind carrier-pigeon/u);

      writeFileSync(
        base,
        JSON.stringify({
          schemaVersion: 1,
          rows: [{ ...rbacRow("/x"), smoke: { ...rbacRow("/x").smoke!, classification: "teleport" } }],
        }),
      );
      assert.throws(() => parseEndpointManifest(base), /unknown smoke classification teleport/u);

      writeFileSync(
        base,
        JSON.stringify({
          schemaVersion: 1,
          rows: [{ ...rbacRow("/x"), smoke: { ...rbacRow("/x").smoke!, expectedStatusClasses: ["maybe"] } }],
        }),
      );
      assert.throws(() => parseEndpointManifest(base), /expectedStatusClasses/u);

      // The full runner also hard-fails, before touching the network.
      await assert.rejects(
        () => runReleaseSmoke({ manifestPath: base }),
        /Malformed endpoint manifest|expectedStatusClasses/u,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("hard-fails when a base URL environment is missing", async () => {
    const manifest: EndpointManifest = { schemaVersion: 1, rows: [automaticRow("/")] };
    const path = writeManifest(manifest);
    try {
      await assert.rejects(
        () => runReleaseSmoke({ manifestPath: path, environment: {} }),
        /LANDING_APP_BASE_URL is required/u,
      );
    } finally {
      rmSync(path, { force: true });
    }
  });

  it("reports non-probed classifications explicitly instead of skipping silently", async () => {
    const manifest: EndpointManifest = {
      schemaVersion: 1,
      rows: [
        {
          project: "landing-app",
          kind: "http",
          method: "ALL",
          path: "/api/auth/*",
          source: "source.ts:1",
          authClassification: "delegated-public-provider",
          coverageClassification: "covered-runtime-contract",
          testEvidence: "source.spec.ts:1",
          smoke: {
            baseUrlEnv: "LANDING_APP_BASE_URL",
            classification: "delegated-runtime",
            expectedStatusClasses: ["2xx", "4xx"],
          },
        },
        {
          ...automaticRow("/stateful"),
          method: "POST",
          smoke: {
            baseUrlEnv: "LANDING_APP_BASE_URL",
            classification: "manual-fixture",
            expectedStatusClasses: ["2xx", "4xx"],
          },
        },
      ],
    };
    const path = writeManifest(manifest);
    try {
      const lines: string[] = [];
      const result = await runReleaseSmoke({
        manifestPath: path,
        environment: { LANDING_APP_BASE_URL: "http://127.0.0.1:1" },
        output: (line) => lines.push(line),
      });
      assert.equal(result.skippedManual, 2);
      const report = lines.join("\n");
      assert.match(report, /not probed over HTTP \(classification delegated-runtime\)/u);
      assert.match(report, /state-changing method POST is never probed/u);
    } finally {
      rmSync(path, { force: true });
    }
  });
});

function automaticRow(path: string): EndpointManifestRow {
  return {
    project: "landing-app",
    kind: "frontend-route",
    method: "N/A",
    path,
    source: "source.ts:1",
    authClassification: "public",
    coverageClassification: "covered-unit",
    testEvidence: "source.spec.ts:1",
    smoke: {
      baseUrlEnv: "LANDING_APP_BASE_URL",
      classification: "automatic",
      expectedStatusClasses: ["2xx"],
    },
  };
}

function rbacRow(path: string): EndpointManifestRow {
  return {
    project: "landing-app",
    kind: "http",
    method: "GET",
    path,
    source: "source.ts:1",
    authClassification: "session-rbac",
    coverageClassification: "covered-unit",
    testEvidence: "source.spec.ts:1",
    smoke: {
      baseUrlEnv: "LANDING_APP_BASE_URL",
      classification: "rbac-allowed-denied",
      expectedStatusClasses: ["2xx"],
    },
  };
}

function writeManifest(manifest: EndpointManifest): string {
  const path = join(mkdtempSync(join(tmpdir(), "release-smoke-")), "manifest.json");
  writeFileSync(path, JSON.stringify(manifest));
  return path;
}
