// @requirements REQ-API-COMPAT-002
// Evidence for: REQ-API-COMPAT-002
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { openApiContracts } from "./contracts-manifest.ts";
import { renderOperationsModule } from "./generate-operations.ts";

const document = {
  paths: {
    "/auth/me": { get: { operationId: "AuthController_me" } },
    "/auth/register": {
      post: {
        operationId: "AuthController_register",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/RegisterDto" } } },
        },
      },
    },
    "/auth/provider-identities/{identityId}": {
      delete: {
        operationId: "AuthController_unlinkProviderIdentity",
        parameters: [{ name: "identityId", in: "path", required: true }],
      },
    },
    "/auth/discord/callback": {
      get: {
        operationId: "AuthController_discordCallback",
        parameters: [
          { name: "code", in: "query", required: true },
          { name: "tenantId", in: "query", required: false },
        ],
      },
    },
    "/api/auth/{path}": {
      search: { operationId: "BetterAuthApiController_handle_search" },
      get: { operationId: "BetterAuthApiController_handle_get" },
    },
    "/admin/notifications/broadcasts/{id}/send": {
      post: {
        operationId: "AdminNotificationsController_sendBroadcast",
        parameters: [
          { name: "id", in: "path", required: true },
          { name: "idempotency-key", in: "header", required: true },
          { name: "x-trace", in: "header", required: false },
        ],
      },
    },
  },
  components: { schemas: { RegisterDto: {}, AuthenticatedUserViewDto: {} } },
};

function render(): string {
  return renderOperationsModule(document, {
    typesModule: "./auth",
    sourcePath: "apps/backend/auth/auth-app-api/contracts/openapi/auth-app-api.json",
  });
}

describe("api operations emitter", () => {
  it("emits a schema alias for every component schema", () => {
    const module = render();

    assert.match(module, /export type RegisterDto = components\['schemas'\]\['RegisterDto'\];/u);
    assert.match(
      module,
      /export type AuthenticatedUserViewDto = components\['schemas'\]\['AuthenticatedUserViewDto'\];/u,
    );
  });

  it("emits a typed callable per operation with path, query, and body arguments", () => {
    const module = render();

    assert.match(
      module,
      /export const authControllerMe = \(options\?: ApiClientRequestOptions\) =>\n {2}client\.GET\(authControllerMePath, toOpenApiFetchOptions\(options\)\);/u,
    );
    assert.match(
      module,
      /export const authControllerRegister = \(body: RegisterDto, options\?: ApiClientRequestOptions\) =>/u,
    );
    assert.match(
      module,
      /export const authControllerUnlinkProviderIdentity = \(identityId: string, options\?: ApiClientRequestOptions\) =>/u,
    );
    assert.match(module, /params: \{ path: \{ identityId \} \}/u);
    assert.match(
      module,
      /export const authControllerDiscordCallback = \(query: AuthControllerDiscordCallbackQuery, options\?: ApiClientRequestOptions\) =>/u,
    );
  });

  it("emits response, data, and error aliases bound to each callable", () => {
    const module = render();

    assert.match(
      module,
      /export type AuthControllerMeResponse = OpenApiData<typeof authControllerMe>;/u,
    );
    assert.match(
      module,
      /export type AuthControllerMeData = EnvelopeData<AuthControllerMeResponse>;/u,
    );
    assert.match(
      module,
      /export type AuthControllerMeError = OpenApiError<typeof authControllerMe>;/u,
    );
  });

  it("emits a query key for reads and a mutation key for writes", () => {
    const module = render();

    assert.match(
      module,
      /export const getAuthControllerMeQueryKey = \(\) => \['get', authControllerMePath\] as const;/u,
    );
    assert.match(
      module,
      /export const getAuthControllerRegisterMutationKey = \(\) => \['post', authControllerRegisterPath\] as const;/u,
    );
    assert.equal(module.includes("getAuthControllerMeMutationKey"), false);
  });

  it("reports rather than emits verbs openapi-fetch cannot call", () => {
    const module = render();

    assert.match(module, /Not emitted:\n \* - SEARCH \/api\/auth\/\{path\} \(unsupported by openapi-fetch\)/u);
    assert.equal(module.includes("betterAuthApiControllerHandleSearch"), false);
  });

  // A placeholder the document never declares is not a path parameter this emitter may invent: the
  // generated `paths` type carries no `parameters` for it, so a callable passing one does not
  // compile, and a callable omitting one requests the literal `{path}` URL. Both are worse than a
  // documented gap. Better-Auth's catch-all is exactly this shape.
  it("reports rather than emits an operation whose url declares an undocumented parameter", () => {
    const module = render();

    assert.match(
      module,
      /Not emitted:\n(?: \* - .*\n)* \* - GET \/api\/auth\/\{path\} \(\{path\} is not a declared parameter\)/u,
    );
    assert.equal(module.includes("betterAuthApiControllerHandleGet"), false);
  });

  // A header the document marks required is part of the call, not of its transport options: leaving
  // it to `options.headers` makes an idempotency key silently omittable, and openapi-fetch's own
  // types reject the call anyway. Optional headers stay in `options`, which is why `x-trace` is
  // absent from the signature.
  it("takes a required header parameter as an argument and passes it through params", () => {
    const module = render();

    assert.match(
      module,
      /export const adminNotificationsControllerSendBroadcast = \(id: string, idempotencyKey: string, options\?: ApiClientRequestOptions\) =>/u,
    );
    assert.match(module, /params: \{ path: \{ id \}, header: \{ 'idempotency-key': idempotencyKey \} \}/u);
    assert.equal(module.includes("xTrace"), false);
  });

  it("refuses a document whose operation ids collide", () => {
    assert.throws(
      () =>
        renderOperationsModule(
          {
            paths: {
              "/a": { get: { operationId: "Controller_read" } },
              "/b": { get: { operationId: "controller.read" } },
            },
          },
          { typesModule: "./a", sourcePath: "a.json" },
        ),
      /Duplicate operationId/u,
    );
  });

  it("is emitted beside the openapi-typescript output by `api clients`", () => {
    const workspace = mkdtempSync(join(tmpdir(), "api-operations-"));

    try {
      for (const contract of openApiContracts()) {
        writeFileSync(join(workspace, `${contract.name}.json`), JSON.stringify(document));
      }
      const generatedRoot = join(workspace, "generated");

      const result = spawnSync(
        process.execPath,
        [
          "--import",
          "jiti/register",
          "packages/tooling/src/commands/api/generate-clients.ts",
          "--contracts-root",
          workspace,
          "--generated-root",
          generatedRoot,
          "--operations-only",
        ],
        { cwd: process.cwd(), encoding: "utf8" },
      );

      assert.equal(result.status, 0, result.stderr);
      assert.match(
        readFileSync(join(generatedRoot, "auth.operations.ts"), "utf8"),
        /export const authControllerMe = /u,
      );
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });
});
