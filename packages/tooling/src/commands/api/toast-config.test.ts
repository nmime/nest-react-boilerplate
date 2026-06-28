// @ts-nocheck
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { checkToastConfigs, collectToastRules, discoverOpenApiContracts, generateToastConfigs } from "./toast-config.ts";

const openApi = {
  openapi: "3.0.0",
  info: { title: "Auth API", version: "1.0.0" },
  paths: {
    "/auth/login": {
      post: {
        operationId: "AuthController_login",
        tags: ["Auth"],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { type: "object" } } } },
          "400": {
            description: "Bad Request",
            content: {
              "application/problem+json": {
                schema: {
                  type: "object",
                  properties: { code: { type: "string", example: "bad-request" } },
                },
              },
            },
          },
          "409": {
            description: "Conflict",
            content: {
              "application/problem+json": {
                schema: { $ref: "#/components/schemas/ConflictProblem" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      ConflictProblem: {
        type: "object",
        properties: { code: { type: "string", enum: ["email-taken", "username-taken"] } },
      },
    },
  },
};

describe("api toast config tooling", () => {
  it("discovers app-local OpenAPI contracts and scaffolds endpoint/status/error-code toast rules", () => {
    const workspaceRoot = makeWorkspace();
    try {
      const contracts = discoverOpenApiContracts(workspaceRoot);
      assert.equal(contracts.length, 1);
      assert.equal(contracts[0].relativePath, "apps/backend/auth-app-api/contracts/openapi/auth-app-api.json");

      const rules = collectToastRules(openApi, "auth-app-api");
      assert.deepEqual(
        rules.map((rule) => [rule.endpoint.method, rule.endpoint.path, rule.status, rule.errorCode, rule.display.category]),
        [
          ["POST", "/auth/login", 200, null, "success"],
          ["POST", "/auth/login", 400, "bad-request", "error"],
          ["POST", "/auth/login", 409, "email-taken", "error"],
          ["POST", "/auth/login", 409, "username-taken", "error"],
        ],
      );
      assert.equal(rules[1].display.mode, "toast");
      assert.equal(rules[1].match.fallbackVariant, "POST_ERR");
      assert.equal(rules[1].enabled, true);
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("generates app-local JSON and checker rejects stale or missing rules", () => {
    const workspaceRoot = makeWorkspace();
    try {
      const contracts = discoverOpenApiContracts(workspaceRoot);
      const generated = generateToastConfigs({ workspaceRoot, contracts, write: true });
      assert.equal(generated[0].path, "apps/backend/auth-app-api/contracts/toast/auth-app-api.toast-rules.generated.json");

      let result = checkToastConfigs({ workspaceRoot, contracts });
      assert.deepEqual(result.errors, []);
      assert.equal(result.rules, 4);

      const configPath = join(workspaceRoot, generated[0].path);
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      config.rules.pop();
      config.rules.push({ ...config.rules[0], id: "stale", endpoint: { ...config.rules[0].endpoint, path: "/stale" } });
      writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

      result = checkToastConfigs({ workspaceRoot, contracts });
      assert.equal(result.errors.some((error) => error.includes("missing endpoint/status/error-code rule auth-app-api|POST|/auth/login|409|username-taken")), true);
      assert.equal(result.errors.some((error) => error.includes("stale endpoint/status/error-code rule auth-app-api|POST|/stale|200|")), true);
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});

function makeWorkspace() {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "toast-config-test-"));
  const contractPath = join(workspaceRoot, "apps/backend/auth-app-api/contracts/openapi/auth-app-api.json");
  mkdirSync(dirname(contractPath), { recursive: true });
  writeFileSync(contractPath, `${JSON.stringify(openApi, null, 2)}\n`);
  return workspaceRoot;
}
