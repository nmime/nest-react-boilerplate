import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

export const EndpointManifestRelativePath =
  "packages/tooling/baselines/endpoint-manifest.generated.json";

export const EndpointKinds = [
  "http",
  "openapi-json",
  "swagger-ui",
  "frontend-route",
  "bot-command",
  "bot-callback",
  "bot-component",
  "bot-modal",
  "cron",
  "lifecycle",
] as const;

export type EndpointKind = (typeof EndpointKinds)[number];

export const EndpointAuthClassifications = [
  "background",
  "browser-session",
  "browser-session-rbac",
  "delegated-public-provider",
  "private-network",
  "public",
  "session",
  "session-rbac",
  "signed-provider",
] as const;

export type EndpointAuthClassification =
  (typeof EndpointAuthClassifications)[number];

export const EndpointCoverageClassifications = [
  "covered-component",
  "covered-integration",
  "covered-runtime-contract",
  "covered-unit",
] as const;

export type EndpointCoverageClassification =
  (typeof EndpointCoverageClassifications)[number];

export const EndpointSmokeClassifications = [
  "automatic",
  "cookie-session",
  "delegated-runtime",
  "manual-fixture",
  "public-conditional",
  "rbac-allowed-denied",
  "signed-provider",
] as const;

export type EndpointSmokeClassification =
  (typeof EndpointSmokeClassifications)[number];

export interface EndpointSmokeClassificationRecord {
  baseUrlEnv: string;
  classification: EndpointSmokeClassification;
  expectedStatusClasses: string[];
}

export interface EndpointManifestRow {
  project: string;
  kind: EndpointKind;
  method: string;
  path: string;
  source: string;
  authClassification: EndpointAuthClassification;
  coverageClassification: EndpointCoverageClassification;
  testEvidence: string;
  smoke?: EndpointSmokeClassificationRecord;
}

export interface EndpointManifest {
  schemaVersion: 1;
  rows: EndpointManifestRow[];
}

export interface EndpointManifestIssue {
  code:
    | "duplicate"
    | "invalid-auth"
    | "invalid-coverage"
    | "invalid-kind"
    | "invalid-smoke"
    | "missing-field"
    | "missing-source"
    | "missing-test-evidence";
  key: string;
  message: string;
}

interface DiscoveredEndpoint {
  project: string;
  kind: EndpointKind;
  method: string;
  path: string;
  source: string;
  decoratorText?: string;
}

interface ControllerOwnerRule {
  project: string;
  prefixes: string[];
}

const controllerOwnerRules: ControllerOwnerRule[] = [
  {
    project: "admin-app-api",
    prefixes: [
      "apps/backend/admin/admin-app-api/src/admin-health.controller.ts",
      "libs/backend/feature/admin/main/lib/src/interfaces/http/",
      "libs/backend/feature/audit-log/admin/lib/src/",
      "libs/backend/feature/auth/admin/lib/src/",
      "libs/backend/feature/notification/admin/lib/src/",
    ],
  },
  {
    project: "auth-app-api",
    prefixes: ["libs/backend/feature/auth/main/lib/src/"],
  },
  {
    project: "user-app-api",
    prefixes: ["libs/backend/feature/user/main/lib/src/"],
  },
  {
    project: "discord-app-api",
    prefixes: ["apps/backend/discord/discord-app-api/src/discord-interactions.controller.ts"],
  },
  {
    project: "telegram-bot-api",
    prefixes: ["apps/backend/telegram/telegram-bot-api/src/telegram-webhook.controller.ts"],
  },
];

const httpApiProjects = [
  "admin-app-api",
  "auth-app-api",
  "discord-app-api",
  "telegram-bot-api",
  "user-app-api",
] as const;

const healthSource = "libs/backend/common/health/lib/src/base-health.controller.ts";
const swaggerSource = "libs/backend/common/swagger/lib/src/swagger.util.ts";

const evidenceRules: Array<{
  matches: (row: DiscoveredEndpoint) => boolean;
  classification: EndpointCoverageClassification;
  evidence: string;
}> = [
  {
    matches: (row) => row.path === "/api/auth/*",
    classification: "covered-runtime-contract",
    evidence:
      "libs/backend/feature/auth/main/lib/src/application/better-auth-runtime-contract.spec.ts",
  },
  {
    matches: (row) => row.project === "landing-app" && row.path === "/problems",
    classification: "covered-component",
    evidence: "apps/frontend/landing/src/astro/pages/problems.spec.ts",
  },
  {
    matches: (row) => row.project === "landing-app",
    classification: "covered-component",
    evidence: "apps/frontend/landing/src/app/app.spec.tsx",
  },
  {
    matches: (row) => row.project === "site-app",
    classification: "covered-component",
    evidence: "apps/frontend/site/pages/index/+Page.spec.tsx",
  },
  {
    matches: (row) => row.project === "mobile-app",
    classification: "covered-component",
    evidence: "apps/frontend/mobile/src/pages/home/ui/mobile-home-screen.spec.tsx",
  },
  {
    matches: (row) => row.project === "admin-app",
    classification: "covered-integration",
    evidence: "apps/frontend/admin/src/app/admin-route-registry.spec.tsx",
  },
  {
    matches: (row) => row.project === "user-app",
    classification: "covered-integration",
    evidence: "apps/frontend/app/src/app/app.spec.tsx",
  },
  {
    matches: (row) => row.kind === "openapi-json" || row.kind === "swagger-ui",
    classification: "covered-unit",
    evidence: "libs/backend/common/swagger/lib/src/swagger.spec.ts",
  },
  {
    matches: (row) => row.source.startsWith("libs/backend/common/health/"),
    classification: "covered-integration",
    evidence: "libs/backend/common/health/lib/src/base-health.controller.spec.ts",
  },
  {
    matches: (row) => row.source.includes("admin-notifications.controller.ts"),
    classification: "covered-component",
    evidence:
      "libs/backend/feature/notification/admin/lib/src/notification-admin-api.module.spec.ts",
  },
  {
    matches: (row) => row.source.includes("audit-log-admin.controller.ts"),
    classification: "covered-component",
    evidence:
      "libs/backend/feature/audit-log/admin/lib/src/audit-log-admin.service.spec.ts",
  },
  {
    matches: (row) => row.source.includes("auth-login-analytics-admin.controller.ts"),
    classification: "covered-component",
    evidence:
      "libs/backend/feature/auth/admin/lib/src/auth-login-analytics-admin.controller.spec.ts",
  },
  {
    matches: (row) => row.source.includes("admin-feature-flags.controller.ts"),
    classification: "covered-component",
    evidence:
      "libs/backend/feature/admin/main/lib/src/interfaces/http/admin-feature-flags.controller.spec.ts",
  },
  {
    matches: (row) => row.source.includes("admin-problem-presentations.controller.ts"),
    classification: "covered-component",
    evidence:
      "libs/backend/feature/admin/main/lib/src/interfaces/http/admin-problem-presentations.controller.spec.ts",
  },
  {
    matches: (row) => row.source.includes("admin-profile.controller.ts"),
    classification: "covered-component",
    evidence:
      "libs/backend/feature/admin/main/lib/src/interfaces/http/admin-profile.controller.spec.ts",
  },
  {
    matches: (row) => row.source.includes("admin-roles.controller.ts"),
    classification: "covered-component",
    evidence:
      "libs/backend/feature/admin/main/lib/src/interfaces/http/admin-roles.controller.spec.ts",
  },
  {
    matches: (row) => row.source.includes("admin-users.controller.ts"),
    classification: "covered-component",
    evidence:
      "libs/backend/feature/admin/main/lib/src/interfaces/http/admin-users.controller.spec.ts",
  },
  {
    matches: (row) => row.source.includes("better-auth-api.controller.ts"),
    classification: "covered-runtime-contract",
    evidence:
      "libs/backend/feature/auth/main/lib/src/application/better-auth-runtime-contract.spec.ts",
  },
  {
    matches: (row) => row.source.includes("auth.controller.ts"),
    classification: "covered-component",
    evidence:
      "libs/backend/feature/auth/main/lib/src/interfaces/http/auth.controller.spec.ts",
  },
  {
    matches: (row) => row.source.includes("problem-presentations.controller.ts"),
    classification: "covered-component",
    evidence:
      "libs/backend/feature/auth/main/lib/src/interfaces/http/problem-presentations.controller.spec.ts",
  },
  {
    matches: (row) => row.source.includes("profile.controller.ts"),
    classification: "covered-component",
    evidence:
      "libs/backend/feature/user/main/lib/src/interfaces/http/profile.controller.spec.ts",
  },
  {
    matches: (row) => row.source.includes("discord-interactions.controller.ts"),
    classification: "covered-component",
    evidence:
      "apps/backend/discord/discord-app-api/src/discord-interactions.controller.spec.ts",
  },
  {
    matches: (row) => row.kind.startsWith("bot-") && row.project === "discord-app-api",
    classification: "covered-component",
    evidence:
      "libs/backend/feature/discord/bot/lib/src/handler/discord-interaction-router.spec.ts",
  },
  {
    matches: (row) => row.source.includes("telegram-webhook.controller.ts"),
    classification: "covered-component",
    evidence:
      "apps/backend/telegram/telegram-bot-api/src/telegram-webhook.controller.spec.ts",
  },
  {
    matches: (row) => row.kind.startsWith("bot-") && row.project === "telegram-bot-api",
    classification: "covered-component",
    evidence: "libs/backend/feature/telegram/bot/lib/src/service/bot.spec.ts",
  },
  {
    matches: (row) => row.path === "telegram:polling-runner",
    classification: "covered-component",
    evidence:
      "apps/backend/telegram/telegram-bot-api/src/telegram-polling.service.spec.ts",
  },
  {
    matches: (row) => row.path === "notification:cron:broadcast-activation",
    classification: "covered-unit",
    evidence:
      "libs/backend/feature/notification/main/lib/src/service/notification-broadcast-scheduler.service.spec.ts",
  },
  {
    matches: (row) => row.path === "notification:cron:partition-maintenance",
    classification: "covered-unit",
    evidence:
      "libs/backend/feature/notification/main/lib/src/service/notification-delivery-partition.service.spec.ts",
  },
  {
    matches: (row) => row.path === "notification:cron:delivery-dispatch",
    classification: "covered-component",
    evidence:
      "libs/backend/feature/notification/main/lib/src/service/notification-delivery-scheduler.service.spec.ts",
  },
  {
    matches: (row) => row.path === "notification:consumer-loop",
    classification: "covered-component",
    evidence:
      "libs/backend/feature/notification/main/lib/src/service/notification-consumer.service.spec.ts",
  },
  {
    matches: (row) => row.path === "notification:provider-readiness",
    classification: "covered-unit",
    evidence:
      "libs/backend/feature/notification/main/lib/src/service/notification-provider-readiness.service.spec.ts",
  },
  {
    matches: (row) => row.path === "auth:expired-token-cleanup",
    classification: "covered-unit",
    evidence:
      "libs/backend/postgres/main/auth/lib/src/auth-token-cleanup.service.spec.ts",
  },
];

export function generateEndpointManifest(
  workspaceRoot: string,
): EndpointManifest {
  const discovered = [
    ...discoverHttpEndpoints(workspaceRoot),
    ...discoverDocumentationEndpoints(workspaceRoot),
    ...discoverFrontendRoutes(workspaceRoot),
    ...discoverExplicitRegistries(workspaceRoot),
  ];

  const rows = discovered
    .map((endpoint) => classifyEndpoint(endpoint))
    .sort(compareRows);

  return { schemaVersion: 1, rows };
}

export function endpointManifestText(manifest: EndpointManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function writeEndpointManifest(workspaceRoot: string): string {
  const manifest = generateEndpointManifest(workspaceRoot);
  const issues = validateEndpointManifest(workspaceRoot, manifest);
  if (issues.length > 0) {
    throw new Error(formatEndpointManifestIssues(issues));
  }
  const output = resolve(workspaceRoot, EndpointManifestRelativePath);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, endpointManifestText(manifest));
  return output;
}

export function checkEndpointManifest(workspaceRoot: string): EndpointManifestIssue[] {
  const generated = generateEndpointManifest(workspaceRoot);
  const issues = validateEndpointManifest(workspaceRoot, generated);
  const output = resolve(workspaceRoot, EndpointManifestRelativePath);
  if (!existsSync(output)) {
    issues.push({
      code: "missing-source",
      key: EndpointManifestRelativePath,
      message: `Generated endpoint manifest is missing; run pnpm run endpoints:manifest:generate.`,
    });
    return issues;
  }
  const checkedIn = readFileSync(output, "utf8");
  const expected = endpointManifestText(generated);
  if (checkedIn !== expected) {
    issues.push({
      code: "missing-source",
      key: EndpointManifestRelativePath,
      message:
        "Generated endpoint manifest is stale; run pnpm run endpoints:manifest:generate and review the classified endpoint diff.",
    });
  }
  return issues;
}

export function validateEndpointManifest(
  workspaceRoot: string,
  manifest: EndpointManifest,
): EndpointManifestIssue[] {
  const issues: EndpointManifestIssue[] = [];
  const keys = new Set<string>();
  for (const row of manifest.rows) {
    const key = endpointKey(row);
    for (const field of ["project", "kind", "method", "path", "source", "testEvidence"] as const) {
      if (row[field].trim() === "") {
        issues.push({
          code: "missing-field",
          key,
          message: `${key} has an empty ${field}.`,
        });
      }
    }
    if (keys.has(key)) {
      issues.push({
        code: "duplicate",
        key,
        message: `${key} has more than one classification row.`,
      });
    }
    keys.add(key);
    if (!EndpointKinds.includes(row.kind)) {
      issues.push({ code: "invalid-kind", key, message: `${key} has invalid kind ${row.kind}.` });
    }
    if (!EndpointAuthClassifications.includes(row.authClassification)) {
      issues.push({
        code: "invalid-auth",
        key,
        message: `${key} has invalid auth classification ${row.authClassification}.`,
      });
    }
    if (!EndpointCoverageClassifications.includes(row.coverageClassification)) {
      issues.push({
        code: "invalid-coverage",
        key,
        message: `${key} has invalid coverage classification ${row.coverageClassification}.`,
      });
    }
    if (!sourceReferenceExists(workspaceRoot, row.source)) {
      issues.push({
        code: "missing-source",
        key,
        message: `${key} points to missing source ${row.source}.`,
      });
    }
    if (!sourceReferenceExists(workspaceRoot, row.testEvidence)) {
      issues.push({
        code: "missing-test-evidence",
        key,
        message: `${key} points to missing test evidence ${row.testEvidence}.`,
      });
    }
    if (isExternallyReachable(row)) {
      if (!row.smoke) {
        issues.push({
          code: "invalid-smoke",
          key,
          message: `${key} is externally reachable but lacks a smoke classification.`,
        });
      } else if (
        !EndpointSmokeClassifications.includes(row.smoke.classification) ||
        row.smoke.baseUrlEnv.trim() === "" ||
        row.smoke.expectedStatusClasses.length === 0
      ) {
        issues.push({
          code: "invalid-smoke",
          key,
          message: `${key} has an incomplete smoke classification.`,
        });
      }
    }
  }
  return issues;
}

export function formatEndpointManifestIssues(
  issues: EndpointManifestIssue[],
): string {
  return issues.map((issue) => `${issue.code}: ${issue.message}`).join("\n");
}

export function endpointKey(
  row: Pick<EndpointManifestRow, "project" | "kind" | "method" | "path">,
): string {
  return [row.project, row.kind, row.method, row.path].join("|");
}

export function isExternallyReachable(
  row: Pick<EndpointManifestRow, "kind">,
): boolean {
  return ["frontend-route", "http", "openapi-json", "swagger-ui"].includes(row.kind);
}

function discoverHttpEndpoints(workspaceRoot: string): DiscoveredEndpoint[] {
  const endpoints: DiscoveredEndpoint[] = [];
  const sourceFiles = collectFiles(workspaceRoot, ["apps", "libs"], ".ts");
  for (const absoluteFile of sourceFiles) {
    const file = relativePath(workspaceRoot, absoluteFile);
    if (isTestFile(file)) continue;
    const owners = controllerOwnerRules
      .filter((rule) => rule.prefixes.some((prefix) => file.startsWith(prefix)))
      .map((rule) => rule.project);
    if (owners.length === 0) continue;
    const text = readFileSync(absoluteFile, "utf8");
    for (const controller of parseControllers(text)) {
      for (const owner of owners) {
        for (const route of controller.routes) {
          endpoints.push({
            project: owner,
            kind: "http",
            method: route.method,
            path: joinRoute(controller.path, route.path),
            source: `${file}:${route.line}`,
            decoratorText: `${controller.decoratorText}\n${route.decoratorText}`,
          });
        }
        if (controller.extendsBaseHealth) {
          endpoints.push(...healthEndpoints(workspaceRoot, owner, controller.path));
        }
      }
    }
  }

  for (const project of httpApiProjects) {
    if (project === "admin-app-api") {
      endpoints.push(...healthEndpoints(workspaceRoot, project, ""));
      continue;
    }
    endpoints.push(...healthEndpoints(workspaceRoot, project, ""));
  }
  return uniqueDiscovered(endpoints);
}

function healthEndpoints(
  workspaceRoot: string,
  project: string,
  prefix: string,
): DiscoveredEndpoint[] {
  const absoluteSource = resolve(workspaceRoot, healthSource);
  const text = readFileSync(absoluteSource, "utf8");
  const controller = parseControllers(text)[0];
  if (!controller) return [];
  return controller.routes.map((route) => ({
    project,
    kind: "http" as const,
    method: route.method,
    path: joinRoute(prefix, route.path),
    source: `${healthSource}:${route.line}`,
    decoratorText: `${controller.decoratorText}\n${route.decoratorText}`,
  }));
}

function discoverDocumentationEndpoints(
  workspaceRoot: string,
): DiscoveredEndpoint[] {
  const swaggerLine = lineOf(readFileSync(resolve(workspaceRoot, swaggerSource), "utf8"), "SwaggerModule.setup");
  return httpApiProjects.flatMap((project) => [
    {
      project,
      kind: "swagger-ui" as const,
      method: "GET",
      path: "/docs",
      source: `${swaggerSource}:${swaggerLine}`,
    },
    {
      project,
      kind: "openapi-json" as const,
      method: "GET",
      path: "/docs/openapi.json",
      source: `${swaggerSource}:${swaggerLine}`,
    },
  ]);
}

function discoverFrontendRoutes(workspaceRoot: string): DiscoveredEndpoint[] {
  return [
    ...discoverAdminFrontendRoutes(workspaceRoot),
    ...discoverUserFrontendRoutes(workspaceRoot),
    ...discoverAstroRoutes(workspaceRoot),
    ...discoverSiteRoutes(workspaceRoot),
    {
      project: "mobile-app",
      kind: "frontend-route",
      method: "N/A",
      path: "/",
      source: "apps/frontend/mobile/src/app/index.tsx:1",
    },
  ];
}

function discoverAdminFrontendRoutes(
  workspaceRoot: string,
): DiscoveredEndpoint[] {
  const file = "apps/frontend/admin/src/shared/admin-route-registry.ts";
  const text = readFileSync(resolve(workspaceRoot, file), "utf8");
  const endpoints: DiscoveredEndpoint[] = [];
  const pathsPattern = /paths:\s*\[([^\]]+)\]/gu;
  for (const match of text.matchAll(pathsPattern)) {
    for (const path of quotedStrings(match[1] ?? "")) {
      endpoints.push({
        project: "admin-app",
        kind: "frontend-route",
        method: "N/A",
        path: path === "/" ? "/admin" : `/admin${path}`,
        source: `${file}:${lineAt(text, match.index ?? 0)}`,
      });
    }
  }
  return endpoints;
}

function discoverUserFrontendRoutes(
  workspaceRoot: string,
): DiscoveredEndpoint[] {
  const file = "apps/frontend/app/src/app/router/user-routes.tsx";
  const text = readFileSync(resolve(workspaceRoot, file), "utf8");
  const start = text.indexOf("export const userRoutes");
  const routeText = start >= 0 ? text.slice(start) : text;
  const endpoints: DiscoveredEndpoint[] = [];
  for (const match of routeText.matchAll(/path:\s*(["'])([^"']+)\1/gu)) {
    endpoints.push({
      project: "user-app",
      kind: "frontend-route",
      method: "N/A",
      path: match[2] ?? "",
      source: `${file}:${lineAt(text, start + (match.index ?? 0))}`,
    });
  }
  return endpoints;
}

function discoverAstroRoutes(workspaceRoot: string): DiscoveredEndpoint[] {
  const pagesRoot = resolve(workspaceRoot, "apps/frontend/landing/src/astro/pages");
  return collectFilesFromDirectory(pagesRoot, ".astro").map((absoluteFile) => {
    const file = relativePath(workspaceRoot, absoluteFile);
    const relativePage = relative(pagesRoot, absoluteFile).replaceAll("\\", "/");
    return {
      project: "landing-app",
      kind: "frontend-route" as const,
      method: "N/A",
      path: pageFileToRoute(relativePage, ".astro"),
      source: `${file}:1`,
    };
  });
}

function discoverSiteRoutes(workspaceRoot: string): DiscoveredEndpoint[] {
  const pagesRoot = resolve(workspaceRoot, "apps/frontend/site/pages");
  return collectFilesFromDirectory(pagesRoot, "+Page.tsx").map((absoluteFile) => {
    const file = relativePath(workspaceRoot, absoluteFile);
    const pageDirectory = relative(pagesRoot, dirname(absoluteFile)).replaceAll("\\", "/");
    return {
      project: "site-app",
      kind: "frontend-route" as const,
      method: "N/A",
      path: pageDirectory === "index" ? "/" : `/${pageDirectory}`,
      source: `${file}:1`,
    };
  });
}

function discoverExplicitRegistries(
  workspaceRoot: string,
): DiscoveredEndpoint[] {
  const endpoints: DiscoveredEndpoint[] = [];
  for (const absoluteFile of collectFiles(workspaceRoot, ["apps", "libs"], ".ts")) {
    const file = relativePath(workspaceRoot, absoluteFile);
    if (isTestFile(file)) continue;
    const text = readFileSync(absoluteFile, "utf8");
    const registryPattern = /export const \w*EndpointRegistry\s*=\s*\[([\s\S]*?)\]\s*as const;/gu;
    for (const registryMatch of text.matchAll(registryPattern)) {
      const registry = registryMatch[1] ?? "";
      for (const objectMatch of registry.matchAll(/\{([^{}]+)\}/gu)) {
        const object = objectMatch[1] ?? "";
        const project = propertyString(object, "project");
        const kind = propertyString(object, "kind") as EndpointKind | undefined;
        const method = propertyString(object, "method");
        const path = propertyString(object, "path");
        if (!project || !kind || !method || !path) continue;
        endpoints.push({
          project,
          kind,
          method,
          path,
          source: `${file}:${lineAt(text, (registryMatch.index ?? 0) + (objectMatch.index ?? 0))}`,
        });
      }
    }
  }
  return endpoints;
}

function classifyEndpoint(endpoint: DiscoveredEndpoint): EndpointManifestRow {
  const evidence = evidenceRules.find((rule) => rule.matches(endpoint));
  if (!evidence) {
    throw new Error(`No coverage classification for ${endpointKey(endpoint)} from ${endpoint.source}.`);
  }
  const row: EndpointManifestRow = {
    project: endpoint.project,
    kind: endpoint.kind,
    method: endpoint.method,
    path: endpoint.path,
    source: endpoint.source,
    authClassification: classifyAuth(endpoint),
    coverageClassification: evidence.classification,
    testEvidence: evidence.evidence,
  };
  if (isExternallyReachable(row)) {
    row.smoke = classifySmoke(row);
  }
  return row;
}

function classifyAuth(endpoint: DiscoveredEndpoint): EndpointAuthClassification {
  if (endpoint.kind === "cron" || endpoint.kind === "lifecycle") return "background";
  if (endpoint.kind.startsWith("bot-")) return "signed-provider";
  if (endpoint.kind === "frontend-route") {
    if (endpoint.project === "admin-app") return "browser-session-rbac";
    if (endpoint.project === "user-app") return "browser-session";
    return "public";
  }
  if (endpoint.kind === "openapi-json" || endpoint.kind === "swagger-ui") return "public";
  if (endpoint.path === "/api/auth/*") return "delegated-public-provider";
  if (endpoint.path.endsWith("/health/private")) return "private-network";
  if (/\/(?:health|live|ready)$/u.test(endpoint.path)) return "public";
  if (endpoint.path === "/discord/interactions" || endpoint.path === "/telegram/webhook") {
    return "signed-provider";
  }
  if (endpoint.project === "admin-app-api") return "session-rbac";
  if (endpoint.project === "user-app-api") return "session-rbac";
  if (endpoint.decoratorText?.includes("@Public()")) return "public";
  if (endpoint.decoratorText?.includes("SessionAuthGuard")) return "session";
  return "public";
}

function classifySmoke(
  row: EndpointManifestRow,
): EndpointSmokeClassificationRecord {
  const baseUrlEnv = baseUrlEnvironment(row.project);
  if (row.kind === "openapi-json" || row.kind === "swagger-ui") {
    return {
      baseUrlEnv,
      classification: "public-conditional",
      expectedStatusClasses: ["2xx", "4xx"],
    };
  }
  if (row.path === "/api/auth/*") {
    return {
      baseUrlEnv,
      classification: "delegated-runtime",
      expectedStatusClasses: ["2xx", "4xx"],
    };
  }
  if (row.authClassification === "signed-provider") {
    return {
      baseUrlEnv,
      classification: "signed-provider",
      expectedStatusClasses: ["2xx", "4xx"],
    };
  }
  if (row.authClassification === "browser-session-rbac" || row.authClassification === "session-rbac") {
    return {
      baseUrlEnv,
      classification:
        row.method === "GET" || row.method === "N/A"
          ? "rbac-allowed-denied"
          : "manual-fixture",
      expectedStatusClasses: ["2xx", "4xx"],
    };
  }
  if (row.authClassification === "browser-session" || row.authClassification === "session") {
    return {
      baseUrlEnv,
      classification:
        row.method === "GET" || row.method === "N/A"
          ? "cookie-session"
          : "manual-fixture",
      expectedStatusClasses: ["2xx", "3xx", "4xx"],
    };
  }
  if (row.authClassification === "private-network") {
    return {
      baseUrlEnv,
      classification: "public-conditional",
      expectedStatusClasses: ["2xx", "4xx"],
    };
  }
  return {
    baseUrlEnv,
    classification:
      row.method === "GET" || row.method === "N/A" ? "automatic" : "manual-fixture",
    expectedStatusClasses: ["2xx", "3xx", "4xx"],
  };
}

function baseUrlEnvironment(project: string): string {
  const explicit: Record<string, string> = {
    "admin-app": "ADMIN_APP_BASE_URL",
    "admin-app-api": "ADMIN_API_BASE_URL",
    "auth-app-api": "AUTH_API_BASE_URL",
    "discord-app-api": "DISCORD_API_BASE_URL",
    "landing-app": "LANDING_APP_BASE_URL",
    "mobile-app": "MOBILE_APP_BASE_URL",
    "site-app": "SITE_APP_BASE_URL",
    "telegram-bot-api": "TELEGRAM_API_BASE_URL",
    "user-app": "USER_APP_BASE_URL",
    "user-app-api": "USER_API_BASE_URL",
  };
  const value = explicit[project];
  if (!value) throw new Error(`No release smoke base URL environment for ${project}.`);
  return value;
}

function parseControllers(text: string): Array<{
  path: string;
  decoratorText: string;
  extendsBaseHealth: boolean;
  routes: Array<{ method: string; path: string; line: number; decoratorText: string }>;
}> {
  const controllers: Array<{
    path: string;
    decoratorText: string;
    extendsBaseHealth: boolean;
    routes: Array<{ method: string; path: string; line: number; decoratorText: string }>;
  }> = [];
  const controllerPattern = /@Controller\(\s*(?:(["'`])([^"'`]*)\1\s*)?\)\s*(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?/gu;
  const matches = [...text.matchAll(controllerPattern)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = match.index ?? 0;
    const bodyStart = start + match[0].length;
    const bodyEnd = matches[index + 1]?.index ?? text.length;
    const body = text.slice(bodyStart, bodyEnd);
    const routePattern = /@(Get|Post|Put|Patch|Delete|All)\(\s*(?:(["'`])([^"'`]*)\2\s*)?\)/gu;
    const routeMatches = [...body.matchAll(routePattern)];
    const routes = routeMatches.map((routeMatch, routeIndex) => {
      const routeStart = routeMatch.index ?? 0;
      const nextRoute = routeMatches[routeIndex + 1]?.index ?? body.length;
      const routeBlock = body.slice(routeStart, nextRoute);
      return {
        method: (routeMatch[1] ?? "").toUpperCase(),
        path: routeMatch[3] ?? "",
        line: lineAt(text, bodyStart + routeStart),
        decoratorText: routeBlock.slice(0, Math.min(routeBlock.length, 2_000)),
      };
    });
    controllers.push({
      path: match[2] ?? "",
      decoratorText: text.slice(Math.max(0, start - 1_500), bodyStart),
      extendsBaseHealth: match[4] === "BaseHealthController",
      routes,
    });
  }
  return controllers;
}

function compareRows(left: EndpointManifestRow, right: EndpointManifestRow): number {
  return endpointKey(left).localeCompare(endpointKey(right));
}

function uniqueDiscovered(endpoints: DiscoveredEndpoint[]): DiscoveredEndpoint[] {
  const byKey = new Map<string, DiscoveredEndpoint>();
  for (const endpoint of endpoints) {
    byKey.set(endpointKey(endpoint), endpoint);
  }
  return [...byKey.values()];
}

function joinRoute(base: string, child: string): string {
  const segments = [base, child]
    .flatMap((part) => part.split("/"))
    .filter(Boolean);
  return `/${segments.join("/")}`;
}

function propertyString(object: string, property: string): string | undefined {
  return object.match(new RegExp(`${property}:\\s*(["'])((?:\\\\.|(?!\\1).)*)\\1`, "u"))?.[2];
}

function quotedStrings(value: string): string[] {
  return [...value.matchAll(/(["'])([^"']+)\1/gu)].map((match) => match[2] ?? "");
}

function pageFileToRoute(file: string, extension: string): string {
  const withoutExtension = file.slice(0, -extension.length);
  const withoutIndex = withoutExtension === "index" ? "" : withoutExtension.replace(/\/index$/u, "");
  return `/${withoutIndex}`;
}

function collectFiles(
  workspaceRoot: string,
  roots: string[],
  suffix: string,
): string[] {
  return roots.flatMap((root) => collectFilesFromDirectory(resolve(workspaceRoot, root), suffix));
}

function collectFilesFromDirectory(directory: string, suffix: string): string[] {
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (["dist", "node_modules"].includes(entry.name)) continue;
      files.push(...collectFilesFromDirectory(path, suffix));
    } else if (entry.name.endsWith(suffix)) {
      files.push(path);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function isTestFile(file: string): boolean {
  return /(?:\.spec|\.test|component-spec|e2e-spec)\.[cm]?[jt]sx?$/u.test(file);
}

function lineAt(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

function lineOf(text: string, needle: string): number {
  const index = text.indexOf(needle);
  return index < 0 ? 1 : lineAt(text, index);
}

function sourceReferenceExists(workspaceRoot: string, reference: string): boolean {
  const file = reference.replace(/:\d+(?::\d+)?$/u, "");
  return existsSync(resolve(workspaceRoot, file));
}

function relativePath(workspaceRoot: string, path: string): string {
  return relative(workspaceRoot, path).replaceAll("\\", "/");
}
