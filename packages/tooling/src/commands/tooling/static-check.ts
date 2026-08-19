import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { isBuiltin } from "node:module";
import { extname } from "node:path";
import { dirname, join, matchesGlob, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createJiti } from "jiti";
import {
  defaultLocale,
  supportedLocales,
} from "@app/common-i18n-runtime";
import {
  discoverCatalogNamespaces,
  discoverLocaleCatalogFiles,
  isLocaleMetadataFile,
} from "../i18n/catalog-sources.ts";
import { run } from "../../runtime/process.ts";
import { declaredPipelineFiles } from "../ci/check-pipelines.ts";

export interface StaticCheckOptions {
  workspaceRoot?: string;
}

export interface ChangedFormatCheckOptions {
  argv?: string[];
  workspaceRoot?: string;
}

export interface CheckFailure {
  command: string;
  file?: string;
  status: number;
  stdout: string;
  stderr: string;
  error?: string;
}

interface ProjectMetadata {
  file: string;
  name: string;
  root: string;
  sourceRoot?: string;
  tags: string[];
}

interface WorkspacePackageManifest {
  file: string;
  name?: string;
  exports?: unknown;
  version?: unknown;
  scripts?: unknown;
  main?: unknown;
  dependencies?: unknown;
  devDependencies?: unknown;
}

interface WorkspaceMetadata {
  projects: ProjectMetadata[];
  tsPathAliases: Record<string, string[]>;
  packageManifests: WorkspacePackageManifest[];
}

const workspaceMetadataIgnoredProjectDirs = new Set([
  ".cache",
  ".git",
  ".nx",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
  "tmp",
]);

const multiTagPrefixAllowlist = new Map([
  ["scope", new Set(["@app/backend-postgres-main"])],
]);

const canonicalTsAliasTargets = new Map([
  ["libs/frontend/api-support/lib/src/index.ts", "@app/frontend-api-support"],
]);

const allowedPlatformPackageManifestFiles = new Set([
  "libs/backend/package.json",
  "libs/frontend/package.json",
]);

interface ReferencedScript {
  owner: string;
  script: string;
  reference: string;
  path: string;
}

const nodeScriptReference =
  /(?:^|&&|\|\||;|\s)node\s+([^\s]+\.(?:cjs|js|mjs|mts|ts))/g;
const shellScriptReference = /(?:^|&&|\|\||;|\s)(?:bash|sh)\s+([^\s]+\.sh)/g;
const pnpmRunReference = /(?:^|&&|\|\||;|\s)pnpm\s+run\s+([@\w:.-]+)/g;
const exportedSymbolDeclaration =
  /export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*Symbol\(\s*["']([^"']+)["']\s*,?\s*\)\s*;/gu;
const exportedAllCapsConstDeclaration =
  /^\s*export\s+(?:declare\s+)?const\s+([A-Z][A-Z0-9_]*)(?=\s*(?::|=))/u;
const injectTokenIdentifier = /^[A-Z][A-Za-z0-9]*InjectToken$/u;
const localNamedBarrelReExport =
  /export\s+(?:type\s+)?\{[\s\S]*?\}\s+from\s+["'](\.{1,2}\/[^"']+)["']\s*;?/gu;
const duplicatedLibrarySourceLibPath =
  /libs\/[A-Za-z0-9_./-]+\/lib\/src\/lib(?:\/|\b)/u;
const staleSlashStyleAppAliasImport =
  /(?:from\s+["']|import\s+(?:type\s+)?["']|import\s*\(["']|require\(["'])(@app\/(?:backend|common|frontend)\/[A-Za-z0-9_./-]+)["']/u;

interface StaleReferencePattern {
  label: string;
  pattern: RegExp;
}

interface ProjectReferencePattern {
  label: string;
  packageScriptPattern: RegExp;
  projectName: string;
}

interface RestrictedImportPattern {
  allowed: (file: string) => boolean;
  label: string;
  pattern: RegExp;
}

interface SecretPattern {
  id: string;
  regex: RegExp;
}

const generatedContractImportPatterns: RestrictedImportPattern[] = [
  {
    allowed: (file) =>
      file.startsWith("libs/common/api-contracts/lib/src/") ||
      file.startsWith("packages/tooling/src/commands/api/"),
    label: "common generated contract internals",
    pattern:
      /(?:libs\/common\/api-contracts\/lib\/src\/generated|@app\/common\/api\/contracts\/.*generated|\.\/generated\/(?:admin-app-api|auth-app-api|user-app-api)(?=$|[\/"'\s;]))/u,
  },
  {
    allowed: (file) =>
      file.startsWith("libs/frontend/api-client/lib/src/") ||
      file.startsWith("packages/tooling/src/commands/api/"),
    label: "frontend generated client internals",
    pattern:
      /(?:libs\/frontend\/api-client\/lib\/src\/generated|@app\/frontend\/api\/client\/.*generated|\.\/generated\/(?:admin|auth|user)(?=$|[\/"'\s;]))/u,
  },
];

const forbiddenSocialAuthImportPatterns: RestrictedImportPattern[] = [
  {
    allowed: (file) => file === "packages/tooling/src/commands/tooling/static-check.test.ts",
    label: "deprecated Telegram Apps namespace",
    pattern: /(?:from\s+["']|import\s*\(["']|require\(["'])@telegram-apps\//u,
  },
  {
    allowed: (file) => file === "packages/tooling/src/commands/tooling/static-check.test.ts",
    label: "deprecated TWA React SDK",
    pattern: /(?:from\s+["']|import\s*\(["']|require\(["'])@twa-dev\//u,
  },
  {
    allowed: (file) => file === "packages/tooling/src/commands/tooling/static-check.test.ts",
    label: "deprecated Telegram auth package",
    pattern: /(?:from\s+["']|import\s*\(["']|require\(["'])@telegram-auth\//u,
  },
  {
    allowed: (file) => file === "packages/tooling/src/commands/tooling/static-check.test.ts",
    label: "deprecated telegram-web-app package",
    pattern: /(?:from\s+["']|import\s*\(["']|require\(["'])telegram-web-app["']/u,
  },
  {
    allowed: (file) => file === "packages/tooling/src/commands/tooling/static-check.test.ts",
    label: "deprecated react-telegram-web-app package",
    pattern:
      /(?:from\s+["']|import\s*\(["']|require\(["'])@vkruglikov\/react-telegram-web-app["']/u,
  },
];

/**
 * The namespace axis is discovered from the default locale rather than enumerated here, matching the
 * generator that builds the catalog bindings from the same tree: adding `i18n/<locale>/user/billing.json`
 * to every locale is the documented way to add a namespace, and it used to hard-fail this gate until
 * someone edited this package.
 */

/**
 * Translation quality rules are a property of the locale, not of the tool: which orthography a
 * language considers residue, which English words betray untranslated prose, and which terms stay
 * in Latin script on purpose all differ per language. Hardcoding them here would mean a product
 * adding a locale has to patch the checker; declaring them in `i18n/<locale>/lint.json` means the
 * locale carries its own rules and a locale that ships no file is simply not prose-linted.
 */
export const localeLintRuleFileName = "lint.json";

const thinLocaleCatalogMaxKeys = 60;
const thinLocaleCatalogMaxNonEmptyLines = 90;

const socialAuthSecretPatterns: SecretPattern[] = [
  {
    id: "telegram-bot-token",
    regex: /\b\d{8,12}:[A-Za-z0-9_-]{35,}\b/gu,
  },
  {
    id: "discord-bot-token",
    regex: /\b(?:mfa\.[A-Za-z0-9_-]{20,}|[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{27,})\b/gu,
  },
  {
    id: "discord-client-secret",
    regex:
      /\b(?:DISCORD_CLIENT_SECRET|discordClientSecret|client_secret)\s*[:=]\s*["']?[A-Za-z0-9_-]{32,}["']?/giu,
  },
];

const forbiddenSocialAuthPackages = new Set([
  "@telegram-apps/sdk",
  "@telegram-apps/sdk-react",
  "@telegram-apps/telegram-ui",
  "@twa-dev/sdk",
  "@twa-dev/types",
  "@telegram-auth/server",
  "@telegram-auth/react",
  "telegram-web-app",
  "@vkruglikov/react-telegram-web-app",
]);

const staleReferencePatterns: StaleReferencePattern[] = [
  {
    label: "retired product reference",
    pattern: new RegExp(["\\bx", "roc", "ket\\b"].join(""), "iu"),
  },
  { label: "retired wallet product reference", pattern: /\bwallet\b/iu },
  { label: "retired common exceptions alias", pattern: /@app\/common\/exceptions/u },
  {
    label: "retired common exceptions path",
    pattern: /libs\/backend\/common\/exceptions/u,
  },
  {
    label: "missing-backend Postgres shared path",
    pattern: /(^|[^A-Za-z0-9_/.-])libs\/postgres\/main\/shared(?:\/|$)/u,
  },
  {
    label: "duplicated Postgres shared lib path",
    pattern:
      /libs\/backend\/postgres\/main\/shared\/lib\/src\/lib\/(?:lib|src\/lib)(?:\/|$)/u,
  },
  {
    label: "duplicated lib source path segment",
    pattern: /\blib\/src\/lib\/src\/lib\b/u,
  },
  {
    label: "retired root backend app path",
    pattern: /(^|[^A-Za-z0-9_/.-])backend\/[^/\s]+\/apps(?:\/|$)/u,
  },
  {
    label: "retired root backend library path",
    pattern: /(^|[^A-Za-z0-9_/.-])backend\/[^/\s]+\/libs(?:\/|$)/u,
  },
  {
    label: "retired flat backend app path",
    pattern: /(^|[^A-Za-z0-9_/.-])apps\/backend\/[^/\s]+-app-api(?:\/|$)/u,
  },
  {
    label: "retired backend bots library path",
    pattern: /(^|[^A-Za-z0-9_/.-])libs\/backend\/bots(?:\/|$)/u,
  },
  {
    label: "retired backend dist path",
    pattern: /(^|[^A-Za-z0-9_/.-])dist\/backend(?:\/|$)/u,
  },
  {
    label: "retired frontend UI compatibility facade path",
    pattern: /libs\/frontend\/ui(?=\/|`|\s|$)/u,
  },
  {
    label: "retired API contract layout helper path",
    pattern: /packages\/tooling\/src\/commands\/api\/contract-layout\.ts/u,
  },
  {
    label: "retired common i18n locale path",
    pattern: /libs\/common\/i18n\/lib\/src\/locales\.ts/u,
  },
  {
    label: "unsupported environment variable name",
    pattern:
      /\b(?:AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|DISCORD_BOT_USERNAME|MINIO_BUCKET|MINIO_ENDPOINT|NATS_URL|OTEL_ENDPOINT|OTEL_EXPORTER_OTLP_HEADERS_FILE|POSTHOG_API_KEY|S3_ACCESS_KEY_FILE|S3_SECRET_KEY_FILE|SENDGRID_API_KEY|SENDGRID_API_KEY_FILE|SENDGRID_FROM_EMAIL|SENDGRID_FROM_NAME|TELEGRAM_BOT_WORKER_PORT)\b/u,
  },
  { label: "retired problem wrapper", pattern: /\bApiProblemExceptions\b/u },
  {
    label: "retired problem validation wrapper",
    pattern: /\bClientDataProblemValidationException\b/u,
  },
  { label: "retired problem filter", pattern: /\bProblemExceptionFilter\b/u },
  {
    label: "retired problem transformer",
    pattern: /\bProblemResponseTransformer\b/u,
  },
  { label: "retired problem HTTP exception", pattern: /\bProblemHttpException\b/u },
  {
    label: "retired problem validation pipe helper",
    pattern: /\bcreateProblemValidationPipe\b/u,
  },
  {
    label: "retired problem validation pipe file",
    pattern: /problem-validation\.pipe/u,
  },
  { label: "retired pnpm major", pattern: /\bpnpm@10(?:\.\d+)?\b/u },
  { label: "retired pnpm major", pattern: /\bpnpm\s+10(?:\.\d+)?\b/u },
  {
    label: "unsupported current Node version reference",
    pattern: /\bNode(?:\.js)?\s+(?:18|20|22)\b/u,
  },
  {
    label: "unsupported workflow Node version reference",
    pattern: /\bnode-version:\s*['"]?(?:18|20|22)(?:\.x)?['"]?\b/u,
  },
  {
    label: "unsupported workflow Node version reference",
    pattern: /\bNODE_VERSION\b[^\S\r\n]*[:=][^\S\r\n]*['"]?(?:18|20|22)(?=[.\s'"]|$)/u,
  },
  { label: "retired Problem Details RFC", pattern: /\bRFC\s?7807\b/iu },
  {
    label: "invalid Problem Details URN namespace",
    pattern: /\burn:problem:/iu,
  },
  {
    label: "retired duplicated admin API project name",
    pattern: /\bbackend-admin-app-api\b/u,
  },
];

const projectReferencePatterns: ProjectReferencePattern[] = [
  {
    label: "admin API e2e Nx target",
    packageScriptPattern: /(?:^|[\s,=])admin-app-api(?:$|[\s,:])/u,
    projectName: "admin-app-api",
  },
  {
    label: "user API e2e Nx target",
    packageScriptPattern: /(?:^|[\s,=])user-app-api(?:$|[\s,:])/u,
    projectName: "user-app-api",
  },
  {
    label: "auth API e2e Nx target",
    packageScriptPattern: /(?:^|[\s,=])auth-app-api(?:$|[\s,:])/u,
    projectName: "auth-app-api",
  },
  {
    label: "admin frontend e2e Nx target",
    packageScriptPattern: /(?:^|[\s,=])admin-app(?:$|[\s,:])/u,
    projectName: "admin-app",
  },
  {
    label: "user frontend e2e Nx target",
    packageScriptPattern: /(?:^|[\s,=])user-app(?:$|[\s,:])/u,
    projectName: "user-app",
  },
  {
    label: "landing frontend e2e Nx target",
    packageScriptPattern: /(?:^|[\s,=])landing-app(?:$|[\s,:])/u,
    projectName: "landing-app",
  },
];

const staleReferenceIgnoredDirectories = new Set([
  ".cache",
  ".git",
  ".nx",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
  "tmp",
]);

const staleReferenceIgnoredFiles = new Set([
  "packages/tooling/src/commands/tooling/static-check.ts",
  "pnpm-lock.yaml",
]);

const localWorktreePrefix = ".claude/worktrees/";

/**
 * Documentation archives are exempt from the architecture/version denylist: a retired term is the
 * point of an archived design note. Which directory holds the archive is an installation choice,
 * so it is read from the `.prettierignore` entries the repository already keeps for the same
 * directories rather than compiled in — a product that archives elsewhere re-points one file.
 */
function staleReferenceArchivePrefixes(workspaceRoot: string): string[] {
  const file = join(workspaceRoot, ".prettierignore");
  if (!existsSync(file)) return [];

  return readFileSync(file, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("docs/") && line.endsWith("/**"))
    .map((line) => line.slice(0, -2));
}

const generatedContractImportExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);

const staleReferenceExtensions = new Set([
  "",
  ".cjs",
  ".cts",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mdx",
  ".mjs",
  ".mts",
  ".sh",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

// Per-child heap caps for the static-check worker pool. The checks run strictly
// sequentially (spawnSync, one child at a time), so the run's worst-case footprint
// is the parent process plus the largest child group, never their sum. Caps turn a
// misbehaving child from an unbounded cgroup OOM-kill candidate into a bounded,
// diagnosable JS heap error, which keeps a 4 GB CI container able to finish the gate
// while a 128 GB server simply never approaches its limit.
const syntaxCheckHeapCapMb = 512;
const toolingTypecheckHeapCapMb = 1024;
const generatorTestHeapCapMb = 1024;
const smokeCommandHeapCapMb = 512;
const frontendFsdHeapCapMb = 512;

/**
 * Builds the child environment for a capped static-check worker: the inherited
 * `NODE_OPTIONS` preserved with the per-worker `--max-old-space-size` cap
 * appended, plus any extra environment (e.g. a reduced test concurrency).
 */
export function staticCheckChildEnv(capMb: number, extraEnv: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const cap = `--max-old-space-size=${capMb}`;
  const inherited = (process.env.NODE_OPTIONS ?? '').trim();
  return {
    NODE_OPTIONS: inherited ? `${inherited} ${cap}` : cap,
    ...extraEnv,
  };
}

export function runStaticCheck(options: StaticCheckOptions = {}): number {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const syntaxTargets = collectToolingModuleScripts(workspaceRoot);
  const smokeCommands = getSmokeCommands();
  // Strictly sequential: each check (and each child it spawns) finishes before
  // the next starts, so intermediate results are the only thing held and child
  // heaps are released between checks.
  const failures: CheckFailure[] = [];
  const push = (value: CheckFailure[]) => failures.push(...value);
  push(checkSyntaxTargets(workspaceRoot, syntaxTargets));
  push(checkToolingTypecheck(workspaceRoot));
  push(checkGeneratorRegressionTests(workspaceRoot));
  push(checkCommandImportSmoke(workspaceRoot));
  push(checkSmokeCommands(workspaceRoot, smokeCommands));
  push(checkPackageProjectReferences(workspaceRoot));
  push(checkFrontendFsd(workspaceRoot));
  push(checkWorkspaceMetadata(workspaceRoot));
  push(checkBunPackageManagerParity(workspaceRoot));
  push(checkExportedAllCapsConstantConventions(workspaceRoot));
  push(checkExportedSymbolTokenConventions(workspaceRoot));
  push(checkLocalBarrelExportConventions(workspaceRoot));
  push(checkDuplicatedLibrarySourceLibPaths(workspaceRoot));
  push(checkFrontendUiOwnership(workspaceRoot));
  push(checkGeneratedContractImports(workspaceRoot));
  push(checkVersionedMigrationAuthzBinding(workspaceRoot));
  push(checkStaleSlashStyleAliasImports(workspaceRoot));
  push(checkForbiddenSocialAuthImports(workspaceRoot));
  push(checkForbiddenSocialAuthDependencies(workspaceRoot));
  push(checkProviderScopedRuntimeImports(workspaceRoot));
  push(checkTrackedSocialAuthSecrets(workspaceRoot));
  push(checkThinLocaleCatalogs(workspaceRoot));
  push(checkTranslationKeyDrift(workspaceRoot));
  push(checkEnvExampleConsistency(workspaceRoot));
  push(checkStaleReferences(workspaceRoot));
  push(checkRepositoryScriptSpecCoverage(workspaceRoot));
  push(checkPackageScriptReferences(workspaceRoot).map(toPackageScriptFailure));

  if (failures.length > 0) {
    reportFailures(failures);
    return 1;
  }

  console.log(
    JSON.stringify({
      status: "ok",
      checkedSyntax: syntaxTargets.length,
      toolingTypecheck: "ok",
      generatorRegressionTests: "ok",
      commandImportSmoke: collectCommandModules(workspaceRoot).length,
      importSmoke: smokeCommands.length,
      frontendFsdSelfTest: "ok",
      frontendFsdWorkspaceCheck: "ok",
      workspaceMetadata: "ok",
      generatedContractImportPatterns: generatedContractImportPatterns.length,
      staleReferenceDenylist: staleReferencePatterns.length,
      packageScriptReferences: countPackageScriptReferences(workspaceRoot),
    }),
  );

  return 0;
}

export function checkBunPackageManagerParity(workspaceRoot: string): CheckFailure[] {
  const failures: CheckFailure[] = [];
  for (const file of ["bun.lock", "bun.lockb", "bunfig.toml"]) {
    if (!existsSync(join(workspaceRoot, file))) continue;
    failures.push({
      command: "bun pnpm dependency parity",
      file,
      status: 1,
      stdout: "",
      stderr: `${file} creates Bun package-manager state; pnpm-lock.yaml and pnpm-installed node_modules are the only dependency authority.`,
    });
  }

  const rootPackagePath = join(workspaceRoot, "package.json");
  if (existsSync(rootPackagePath)) {
    const rootPackage = JSON.parse(readFileSync(rootPackagePath, "utf8")) as { workspaces?: unknown };
    if (rootPackage.workspaces !== undefined) {
      failures.push({
        command: "bun pnpm dependency parity",
        file: "package.json",
        status: 1,
        stdout: "",
        stderr: "Root package.json must not duplicate pnpm-workspace.yaml with a Bun/npm workspaces declaration.",
      });
    }
  }

  const executableFiles = new Set<string>();
  for (const manifest of collectWorkspacePackageManifests(workspaceRoot)) {
    executableFiles.add(manifest.file);
  }
  executableFiles.add("package.json");
  if (existsSync(join(workspaceRoot, "Dockerfile"))) executableFiles.add("Dockerfile");
  const workflowsRoot = join(workspaceRoot, ".github/workflows");
  if (existsSync(workflowsRoot)) {
    for (const file of walk(workflowsRoot)) executableFiles.add(relativeToWorkspace(workspaceRoot, file));
  }
  for (const file of declaredPipelineFiles(workspaceRoot)) executableFiles.add(file);

  const forbiddenCommand = /\b(?:bunx|bun\s+(?:add|install|pm|remove|update|x))\b/u;
  for (const file of [...executableFiles].sort()) {
    const absolutePath = join(workspaceRoot, file);
    if (!existsSync(absolutePath)) continue;
    const content = readFileSync(absolutePath, "utf8");
    const match = content.match(forbiddenCommand)?.[0];
    if (!match) continue;
    failures.push({
      command: "bun pnpm dependency parity",
      file,
      status: 1,
      stdout: "",
      stderr: `${file} invokes ${match}; Bun may execute only the dependency tree installed and locked by pnpm.`,
    });
  }
  return failures;
}

function checkSyntaxTargets(
  workspaceRoot: string,
  syntaxTargets: string[],
): CheckFailure[] {
  return syntaxTargets.flatMap((script) => {
    const result = run(process.execPath, ["--check", script], {
      cwd: workspaceRoot,
      env: staticCheckChildEnv(syntaxCheckHeapCapMb),
    });

    if (result.status === 0) return [];

    return [
      {
        ...result,
        file: relativeToWorkspace(workspaceRoot, script),
      },
    ];
  });
}

function checkToolingTypecheck(workspaceRoot: string): CheckFailure[] {
  const result = run(
    process.execPath,
    [
      "node_modules/typescript/bin/tsc",
      "--noEmit",
      "-p",
      "packages/tooling/tsconfig.json",
    ],
    {
      cwd: workspaceRoot,
      env: staticCheckChildEnv(toolingTypecheckHeapCapMb),
    },
  );

  return result.status === 0 ? [] : [result];
}

function checkGeneratorRegressionTests(workspaceRoot: string): CheckFailure[] {
  const result = run(process.execPath, ["packages/tooling/scripts/run-tests.mjs"], {
    cwd: workspaceRoot,
    // Static validation must stay hermetic; Docker/PostgreSQL integration is
    // exercised by the dedicated integration and acceptance gates. The test
    // files run one at a time so the suite's two test workers never overlap
    // in memory on top of the already-capped runner.
    env: staticCheckChildEnv(generatorTestHeapCapMb, {
      SKIP_INTEGRATION: "1",
      NODE_TEST_CONCURRENCY: "1",
    }),
  });

  return result.status === 0 ? [] : [result];
}

export function collectCommandModules(workspaceRoot: string): string[] {
  const commandsRoot = resolve(workspaceRoot, "packages/tooling/src/commands");
  if (!existsSync(commandsRoot)) return [];

  return walk(commandsRoot)
    .filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts"))
    .sort((left, right) => left.localeCompare(right));
}

// The CLI loads every registered command module lazily via jiti, so `--help` and
// unrelated commands never import most modules. A broken import path therefore only
// surfaces when that specific command is invoked. This step statically loads the
// import graph of every command module with the same jiti loader (transform + resolve,
// no evaluation) so unresolved imports fail fast during static-check instead.
export function checkCommandImportSmoke(workspaceRoot: string): CheckFailure[] {
  const modules = collectCommandModules(workspaceRoot);
  if (modules.length === 0) return [];

  const cliEntry = resolve(workspaceRoot, "packages/tooling/src/cli.ts");
  const jiti = createJiti(pathToFileURL(cliEntry).href, {
    alias: readTsPathAliasMap(workspaceRoot),
  });
  const requirePattern = /require\(\s*["']([^"']+)["']\s*\)/gu;
  const failures: CheckFailure[] = [];

  for (const modulePath of modules) {
    const relativeFile = relativeToWorkspace(workspaceRoot, modulePath);

    let transformed: string;
    try {
      transformed = jiti.transform({
        source: readFileSync(modulePath, "utf8"),
        filename: modulePath,
        ts: true,
      });
    } catch (error) {
      failures.push({
        command: "command module import smoke",
        file: relativeFile,
        status: 1,
        stdout: "",
        stderr: `Failed to load module via jiti: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    const parentURL = pathToFileURL(modulePath).href;
    const specifiers = new Set<string>();
    requirePattern.lastIndex = 0;
    for (const match of transformed.matchAll(requirePattern)) {
      const specifier = match[1];
      if (specifier) specifiers.add(specifier);
    }

    for (const specifier of specifiers) {
      // Computed/template specifiers cannot be resolved statically.
      if (specifier.includes("${")) continue;
      if (specifier.startsWith("node:") || isBuiltin(specifier)) continue;

      let resolved: string | undefined;
      try {
        resolved = jiti.esmResolve(specifier, { parentURL, try: true });
      } catch {
        resolved = undefined;
      }

      if (!resolved) {
        failures.push({
          command: "command module import smoke",
          file: relativeFile,
          status: 1,
          stdout: "",
          stderr: `Unresolved import "${specifier}". The CLI imports every command module via jiti, so a broken import path throws at command invocation time.`,
        });
      }
    }
  }

  return failures;
}

function readTsPathAliasMap(workspaceRoot: string): Record<string, string> {
  const alias: Record<string, string> = {};
  for (const [key, targets] of Object.entries(readTsPathAliases(workspaceRoot))) {
    if (key.endsWith("/*")) continue;
    const target = targets[0];
    if (target) alias[key] = resolve(workspaceRoot, target);
  }
  return alias;
}

function getSmokeCommands(): string[][] {
  return [
    ["packages/tooling/bin/repo-tooling.mjs", "--help"],
    ["packages/tooling/bin/repo-tooling.mjs", "setup", "--help"],
    ["packages/tooling/bin/repo-tooling.mjs", "add", "--help"],
    [
      "packages/tooling/bin/repo-tooling.mjs",
      "git",
      "branch-cleanup",
      "--help",
    ],
    [
      "packages/tooling/bin/repo-tooling.mjs",
      "git",
      "conventions",
      "--help",
    ],
    [
      "packages/tooling/bin/repo-tooling.mjs",
      "project",
      "check-library-configs",
      "--help",
    ],
    [
      "packages/tooling/bin/repo-tooling.mjs",
      "tooling",
      "static-check",
      "--help",
    ],
    [
      "packages/tooling/bin/repo-tooling.mjs",
      "tooling",
      "changed-format-check",
      "--help",
    ],
    [
      "packages/tooling/bin/repo-tooling.mjs",
      "api",
      "toast-config",
      "generate",
      "--help",
    ],
    [
      "packages/tooling/bin/repo-tooling.mjs",
      "api",
      "toast-config",
      "check",
      "--help",
    ],
    [
      "packages/tooling/bin/repo-tooling.mjs",
      "frontend",
      "fsd",
      "check",
      "--help",
    ],
    [
      "packages/tooling/bin/repo-tooling.mjs",
      "db",
      "migrations",
      "rollback-check",
      "--help",
    ],
  ];
}

function checkSmokeCommands(
  workspaceRoot: string,
  smokeCommands: string[][],
): CheckFailure[] {
  return smokeCommands.flatMap((args) => {
    const result = run(process.execPath, args, {
      cwd: workspaceRoot,
      env: staticCheckChildEnv(smokeCommandHeapCapMb),
    });
    return result.status === 0 ? [] : [result];
  });
}

function checkFrontendFsd(workspaceRoot: string): CheckFailure[] {
  const selfTest = run(
    process.execPath,
    [
      "packages/tooling/bin/repo-tooling.mjs",
      "frontend",
      "fsd",
      "check",
      "--self-test",
    ],
    { cwd: workspaceRoot, env: staticCheckChildEnv(frontendFsdHeapCapMb) },
  );
  const workspaceCheck = run(
    process.execPath,
    ["packages/tooling/bin/repo-tooling.mjs", "frontend", "fsd", "check"],
    { cwd: workspaceRoot, env: staticCheckChildEnv(frontendFsdHeapCapMb) },
  );

  return [selfTest, workspaceCheck].filter((result) => result.status !== 0);
}

export function checkWorkspaceMetadata(workspaceRoot: string): CheckFailure[] {
  const metadata = readWorkspaceMetadata(workspaceRoot);
  return [
    ...checkProjectTags(metadata.projects),
    ...checkTsPathAliases(metadata.tsPathAliases),
    ...checkWorkspacePackageManifests(metadata),
  ];
}

function checkProjectTags(projects: ProjectMetadata[]): CheckFailure[] {
  return projects.flatMap((project) => {
    const failures: CheckFailure[] = [];
    const tagsByPrefix = new Map<string, string[]>();

    if (isNonPackageStyleAppName(project.name)) {
      failures.push({
        command: "workspace metadata project names",
        file: project.file,
        status: 1,
        stdout: "",
        stderr: `Nx project name ${project.name} must use package-style flattened naming with only the @app scope slash; stale slash-style @app aliases are not allowed.`,
      });
    }

    for (const tag of project.tags) {
      const [prefix] = tag.split(":", 1);
      if (!prefix) continue;
      const prefixedTags = tagsByPrefix.get(prefix) ?? [];
      prefixedTags.push(tag);
      tagsByPrefix.set(prefix, prefixedTags);
    }

    for (const [prefix, tags] of tagsByPrefix) {
      if (tags.length <= 1) continue;
      if (multiTagPrefixAllowlist.get(prefix)?.has(project.name)) continue;
      failures.push({
        command: "workspace metadata project tags",
        file: project.file,
        status: 1,
        stdout: "",
        stderr: `${project.name} has multiple ${prefix}: tags: ${tags.join(", ")}`,
      });
    }

    return failures;
  });
}

function checkTsPathAliases(paths: Record<string, string[]>): CheckFailure[] {
  const aliasesByTarget = new Map<string, string[]>();
  const failures: CheckFailure[] = [];

  for (const [alias, targets] of Object.entries(paths)) {
    if (isNonPackageStyleAppName(alias)) {
      failures.push({
        command: "workspace metadata tsconfig paths",
        file: "tsconfig.base.json",
        status: 1,
        stdout: "",
        stderr: `TS path alias ${alias} must use package-style flattened naming with only the @app scope slash; stale slash-style @app aliases are not allowed.`,
      });
    }

    for (const target of targets) {
      const aliases = aliasesByTarget.get(target) ?? [];
      aliases.push(alias);
      aliasesByTarget.set(target, aliases);
    }
  }

  failures.push(
    ...[...aliasesByTarget.entries()].flatMap(([target, aliases]) => {
      if (aliases.length <= 1) return [];
      const canonicalAlias = canonicalTsAliasTargets.get(target);
      const canonicalHint = canonicalAlias
        ? ` Keep the canonical ${canonicalAlias} alias only.`
        : " Use one canonical alias for each source target.";

      return [
        {
          command: "workspace metadata tsconfig paths",
          file: "tsconfig.base.json",
          status: 1,
          stdout: "",
          stderr: `Duplicate TS path target ${target} is mapped by ${aliases.join(", ")}.${canonicalHint}`,
        },
      ];
    }),
  );

  return failures;
}

function isNonPackageStyleAppName(name: string): boolean {
  if (!name.startsWith("@app/")) return false;

  const segments = name.slice("@app/".length).split("/");
  if (segments.length <= 1) return false;

  return !(segments.length === 2 && segments[1] === "*");
}

function checkWorkspacePackageManifests(
  metadata: WorkspaceMetadata,
): CheckFailure[] {
  const invalidApplicationPackageFiles = metadata.packageManifests
    .filter((manifest) => manifest.file.startsWith("apps/"))
    .filter(
      (manifest) =>
        manifest.name !== undefined ||
        manifest.version !== undefined ||
        manifest.scripts !== undefined ||
        manifest.main !== undefined ||
        !hasExternalDependencyGroup(manifest),
    )
    .map((manifest) => manifest.file);
  const libraryPackageFiles = metadata.packageManifests
    .filter(
      (manifest) =>
        manifest.file.startsWith("libs/") &&
        !allowedPlatformPackageManifestFiles.has(manifest.file),
    )
    .map((manifest) => manifest.file);
  const packageWorkspaceFiles = metadata.packageManifests
    .filter((manifest) => manifest.file.startsWith("packages/"))
    .map((manifest) => manifest.file);

  if (invalidApplicationPackageFiles.length > 0) {
    return [
      {
        command: "workspace metadata package manifests",
        file: "pnpm-workspace.yaml",
        status: 1,
        stdout: "",
        stderr: `Nx project.json owns application identity and targets. Application package manifests are allowed only as dependency-only renderer boundaries with no name, version, scripts, or main field. Fix or remove: ${invalidApplicationPackageFiles.join(", ")}.`,
      },
    ];
  }

  if (libraryPackageFiles.length > 0) {
    return [
      {
        command: "workspace metadata package manifests",
        file: "pnpm-workspace.yaml",
        status: 1,
        stdout: "",
        stderr: `Nested libraries must not define package.json manifests; keep dependencies in root or platform manifests under libs/backend/package.json and libs/frontend/package.json. Found ${libraryPackageFiles.join(", ")}.`,
      },
    ];
  }

  if (
    packageWorkspaceFiles.length === 1 &&
    packageWorkspaceFiles[0] === "packages/tooling/package.json"
  ) {
    return [];
  }

  return [
    {
      command: "workspace metadata package manifests",
      file: "pnpm-workspace.yaml",
      status: 1,
      stdout: "",
      stderr: `Expected packages/tooling to be the only packages/* workspace manifest; found ${packageWorkspaceFiles.join(", ") || "none"}. Update docs/static checks before adding package-style workspaces.`,
    },
  ];
}

function readWorkspaceMetadata(workspaceRoot: string): WorkspaceMetadata {
  return {
    projects: collectProjectMetadata(workspaceRoot),
    tsPathAliases: readTsPathAliases(workspaceRoot),
    packageManifests: collectWorkspacePackageManifests(workspaceRoot),
  };
}

function collectProjectMetadata(workspaceRoot: string): ProjectMetadata[] {
  return walkWorkspaceMetadata(workspaceRoot, workspaceRoot)
    .filter((file) => isWorkspaceMetadataFileName(file, "project.json"))
    .map((file) => {
      const relativeFile = relativeToWorkspace(workspaceRoot, file);
      const parsed = JSON.parse(readFileSync(file, "utf8")) as {
        name?: string;
        sourceRoot?: string;
        tags?: string[];
      };

      return {
        file: relativeFile,
        name: parsed.name ?? relativeFile,
        root: dirname(relativeFile),
        sourceRoot: parsed.sourceRoot,
        tags: parsed.tags ?? [],
      };
    });
}

function readTsPathAliases(workspaceRoot: string): Record<string, string[]> {
  const parsed = JSON.parse(
    readFileSync(resolve(workspaceRoot, "tsconfig.base.json"), "utf8"),
  ) as { compilerOptions?: { paths?: Record<string, string[]> } };

  return parsed.compilerOptions?.paths ?? {};
}

function collectWorkspacePackageManifests(
  workspaceRoot: string,
): WorkspacePackageManifest[] {
  return walkWorkspaceMetadata(workspaceRoot, workspaceRoot)
    .filter((file) => isWorkspaceMetadataFileName(file, "package.json"))
    .filter((file) => isWorkspacePackageManifest(workspaceRoot, file))
    .map((file) => {
      const relativeFile = relativeToWorkspace(workspaceRoot, file);
      const parsed = JSON.parse(readFileSync(file, "utf8")) as {
        name?: string;
        exports?: unknown;
        version?: unknown;
        scripts?: unknown;
        main?: unknown;
        dependencies?: unknown;
        devDependencies?: unknown;
      };

      return {
        file: relativeFile,
        name: parsed.name,
        exports: parsed.exports,
        version: parsed.version,
        scripts: parsed.scripts,
        main: parsed.main,
        dependencies: parsed.dependencies,
        devDependencies: parsed.devDependencies,
      };
    });
}

function hasExternalDependencyGroup(manifest: WorkspacePackageManifest): boolean {
  return [manifest.dependencies, manifest.devDependencies].some(
    (section) =>
      typeof section === "object" &&
      section !== null &&
      !Array.isArray(section) &&
      Object.keys(section).length > 0,
  );
}

export function isWorkspaceMetadataFileName(
  file: string,
  fileName: "package.json" | "project.json",
): boolean {
  const normalizedFile = file.replaceAll("\\", "/");
  return normalizedFile === fileName || normalizedFile.endsWith(`/${fileName}`);
}

function isWorkspacePackageManifest(workspaceRoot: string, file: string): boolean {
  const relativeFile = relativeToWorkspace(workspaceRoot, file);
  return (
    relativeFile.startsWith("apps/") ||
    relativeFile.startsWith("libs/") ||
    relativeFile.startsWith("packages/")
  );
}

function walkWorkspaceMetadata(workspaceRoot: string, current: string): string[] {
  return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      if (
        workspaceMetadataIgnoredProjectDirs.has(entry.name) ||
        isLocalWorktreePath(workspaceRoot, path)
      ) return [];
      return walkWorkspaceMetadata(workspaceRoot, path);
    }

    if (!entry.isFile()) return [];
    if (entry.name !== "project.json" && entry.name !== "package.json") return [];
    return [path];
  });
}

// A versioned migration is replayed against databases that already ran it, so what it seeds must
// never change meaning. The composed authz exports widen the moment a product registers
// `productAuthzExtensions`, which would retroactively rewrite history; the `base*` exports are
// frozen. Converging reconcilers (Mongo bootstrap) and specs are deliberately exempt.
const composedAuthzCatalogSymbols = new Map([
  ["defaultRolePermissions", "baseRolePermissions"],
  ["permissionCatalog", "basePermissionCatalog"],
  ["permissionsForRoles", "baseRolePermissions"],
  ["roleKeys", "baseRoleKeys"],
]);

const versionedMigrationFile = /(?:^|\/)migrations\/Migration\d+[A-Za-z0-9]*\.ts$/u;

export function checkVersionedMigrationAuthzBinding(
  workspaceRoot: string,
): CheckFailure[] {
  return collectGeneratedContractImportTargets(workspaceRoot).flatMap((file) => {
    const relativeFile = relativeToWorkspace(workspaceRoot, file);
    if (!versionedMigrationFile.test(relativeFile)) return [];

    const text = readFileSync(file, "utf8");
    const failures: CheckFailure[] = [];

    // Named imports span multiple lines, so match the whole statement and report its first line.
    const authzImport = /import\s*\{([^}]*)\}\s*from\s*["']@app\/common-authz["']/gu;
    for (const match of text.matchAll(authzImport)) {
      const imported = (match[1] ?? "")
        .split(",")
        .map((entry) => entry.trim().split(/\s+as\s+/u)[0]?.trim() ?? "")
        .filter(Boolean);
      const offenders = imported.filter((name) => composedAuthzCatalogSymbols.has(name)).sort();
      if (offenders.length === 0) continue;

      const replacements = [
        ...new Set(offenders.map((name) => composedAuthzCatalogSymbols.get(name) ?? name)),
      ].sort();

      failures.push({
        command: "versioned migration authz binding",
        file: `${relativeFile}:${text.slice(0, match.index).split(/\r?\n/u).length}`,
        status: 1,
        stdout: "",
        stderr: `Versioned migration imports composed authz catalog symbols (${offenders.join(", ")}). Import the frozen base exports instead (${replacements.join(", ")}) so a product registering productAuthzExtensions cannot retroactively change rows this migration already seeded.`,
      });
    }

    return failures;
  });
}

export function checkGeneratedContractImports(
  workspaceRoot: string,
): CheckFailure[] {
  return collectGeneratedContractImportTargets(workspaceRoot).flatMap((file) => {
    const relativeFile = relativeToWorkspace(workspaceRoot, file);
    const text = readFileSync(file, "utf8");
    const failures: CheckFailure[] = [];

    text.split(/\r?\n/u).forEach((line, index) => {
      for (const importPattern of generatedContractImportPatterns) {
        if (importPattern.allowed(relativeFile)) continue;
        if (!isImportBoundaryLine(line)) continue;
        if (!importPattern.pattern.test(line)) continue;

        failures.push({
          command: "generated contract public import boundary",
          file: `${relativeFile}:${index + 1}`,
          status: 1,
          stdout: "",
          stderr: `Found ${importPattern.label} import. Use stable public aliases @app/common-api-contracts and @app/frontend-api-client instead of generated internals.`,
        });
      }
    });

    return failures;
  });
}

export function checkExportedSymbolTokenConventions(
  workspaceRoot: string,
): CheckFailure[] {
  return collectGeneratedContractImportTargets(workspaceRoot).flatMap((file) => {
    const relativeFile = relativeToWorkspace(workspaceRoot, file);
    if (relativeFile === "packages/tooling/src/commands/tooling/static-check.test.ts") {
      return [];
    }

    const text = readFileSync(file, "utf8");
    const failures: CheckFailure[] = [];

    exportedSymbolDeclaration.lastIndex = 0;
    for (const match of text.matchAll(exportedSymbolDeclaration)) {
      const name = match[1] ?? "";
      const description = match[2] ?? "";
      if (injectTokenIdentifier.test(name) && description === name) {
        continue;
      }

      const line = text.slice(0, match.index).split("\n").length;
      failures.push({
        command: "exported symbol token convention",
        file: `${relativeFile}:${line}`,
        status: 1,
        stdout: "",
        stderr: `Exported Symbol token ${name} must use a PascalCase InjectToken name and matching Symbol("${name}") description, following the reference inject-token convention.`,
      });
    }

    return failures;
  });
}

export function checkExportedAllCapsConstantConventions(
  workspaceRoot: string,
): CheckFailure[] {
  return collectGeneratedContractImportTargets(workspaceRoot).flatMap((file) => {
    const relativeFile = relativeToWorkspace(workspaceRoot, file);
    if (relativeFile === "packages/tooling/src/commands/tooling/static-check.test.ts") {
      return [];
    }

    const text = readFileSync(file, "utf8");
    const failures: CheckFailure[] = [];

    text.split(/\r?\n/u).forEach((line, index) => {
      const match = exportedAllCapsConstDeclaration.exec(line);
      const name = match?.[1];
      if (!name) return;

      failures.push({
        command: "exported constant naming convention",
        file: `${relativeFile}:${index + 1}`,
        status: 1,
        stdout: "",
        stderr: `Exported constant ${name} must not use ALL_CAPS naming. Use a descriptive PascalCase or camelCase exported name such as DefaultAuthTenantId.`,
      });
    });

    return failures;
  });
}

export function checkLocalBarrelExportConventions(
  workspaceRoot: string,
): CheckFailure[] {
  return collectGeneratedContractImportTargets(workspaceRoot).flatMap((file) => {
    const relativeFile = relativeToWorkspace(workspaceRoot, file);
    if (relativeFile === "packages/tooling/src/commands/tooling/static-check.test.ts") {
      return [];
    }

    const text = readFileSync(file, "utf8");
    const failures: CheckFailure[] = [];

    localNamedBarrelReExport.lastIndex = 0;
    for (const match of text.matchAll(localNamedBarrelReExport)) {
      const specifier = match[1] ?? "";
      const line = text.slice(0, match.index).split("\n").length;

      failures.push({
        command: "local re-export convention",
        file: `${relativeFile}:${line}`,
        status: 1,
        stdout: "",
        stderr: `Local re-export ${specifier} by name. Use export * from "${specifier}"; for local re-exports.`,
      });
    }

    return failures;
  });
}

export function checkDuplicatedLibrarySourceLibPaths(
  workspaceRoot: string,
): CheckFailure[] {
  const librarySourceLibDirectories = collectProjectMetadata(workspaceRoot)
    .map((project) => `${project.root}/src/lib`)
    .filter((sourceDirectory) => sourceDirectory.startsWith("libs/"));
  const failures: CheckFailure[] = [];

  for (const sourceDirectory of librarySourceLibDirectories) {
    if (!existsSync(resolve(workspaceRoot, sourceDirectory))) continue;

    failures.push({
      command: "library duplicated source lib path convention",
      file: sourceDirectory,
      status: 1,
      stdout: "",
      stderr:
        "Libraries must not use lib/src/lib. Keep source folders directly below src, for example libs/backend/feature/auth/main/lib/src/domain or libs/frontend/ui-web/lib/src/component.",
    });
  }

  for (const file of collectStaleReferenceTargets(workspaceRoot)) {
    const relativeFile = relativeToWorkspace(workspaceRoot, file);
    if (relativeFile === "packages/tooling/src/commands/tooling/static-check.test.ts") {
      continue;
    }

    const text = readFileSync(file, "utf8");
    text.split(/\r?\n/u).forEach((line, index) => {
      if (!duplicatedLibrarySourceLibPath.test(line)) return;

      failures.push({
        command: "library duplicated source lib path convention",
        file: `${relativeFile}:${index + 1}`,
        status: 1,
        stdout: "",
        stderr:
          "Found a lib/src/lib path. Use lib/src/<domain> paths such as libs/backend/feature/auth/main/lib/src/domain or libs/frontend/ui-web/lib/src/component.",
      });
    });
  }

  return failures;
}

export function checkFrontendUiOwnership(workspaceRoot: string): CheckFailure[] {
  const roots = ["apps/frontend", "libs/frontend"]
    .map((root) => resolve(workspaceRoot, root))
    .filter((root) => existsSync(root));

  return roots.flatMap((root) =>
    walk(root)
      .map((file) => relativeToWorkspace(workspaceRoot, file))
      .filter((file) => /(?:^|\/)components\/ui\//u.test(file))
      .map((file) => ({
        command: "frontend shared UI ownership",
        file,
        status: 1,
        stdout: "",
        stderr:
          "App-local or generic components/ui source duplicates the design system. Move reusable React DOM UI to libs/frontend/ui-web/lib/src/component and export it through @app/frontend-ui-web.",
      })),
  );
}

export function checkStaleSlashStyleAliasImports(
  workspaceRoot: string,
): CheckFailure[] {
  return collectGeneratedContractImportTargets(workspaceRoot).flatMap((file) => {
    const relativeFile = relativeToWorkspace(workspaceRoot, file);
    const text = readFileSync(file, "utf8");
    const failures: CheckFailure[] = [];

    text.split(/\r?\n/u).forEach((line, index) => {
      if (!isImportBoundaryLine(line)) return;

      const match = staleSlashStyleAppAliasImport.exec(line);
      const alias = match?.[1];
      if (!alias) return;

      failures.push({
        command: "stale slash-style alias import",
        file: `${relativeFile}:${index + 1}`,
        status: 1,
        stdout: "",
        stderr: `Found stale slash-style alias ${alias}. Use flattened @app aliases such as @app/common-api-contracts or @app/frontend-api-client instead of @app/<platform>/... imports.`,
      });
    });

    return failures;
  });
}

export function checkForbiddenSocialAuthImports(
  workspaceRoot: string,
): CheckFailure[] {
  return collectGeneratedContractImportTargets(workspaceRoot).flatMap((file) => {
    const relativeFile = relativeToWorkspace(workspaceRoot, file);
    const text = readFileSync(file, "utf8");
    const failures: CheckFailure[] = [];

    text.split(/\r?\n/u).forEach((line, index) => {
      for (const importPattern of forbiddenSocialAuthImportPatterns) {
        if (importPattern.allowed(relativeFile)) continue;
        if (!isImportBoundaryLine(line)) continue;
        if (!importPattern.pattern.test(line)) continue;

        failures.push({
          command: "social auth forbidden import boundary",
          file: `${relativeFile}:${index + 1}`,
          status: 1,
          stdout: "",
          stderr: `Found ${importPattern.label} import. Use @tma.js for Telegram Mini Apps, grammY for Telegram bots, and the approved Discord stack instead.`,
        });
      }
    });

    return failures;
  });
}

export function checkForbiddenSocialAuthDependencies(
  workspaceRoot: string,
): CheckFailure[] {
  return collectPackageManifests(workspaceRoot).flatMap((file) => {
    const relativeFile = relativeToWorkspace(workspaceRoot, file);
    const manifest = JSON.parse(readFileSync(file, "utf8")) as Record<
      string,
      Record<string, string> | undefined
    >;
    const dependencySections = [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ];

    return dependencySections.flatMap((section) => {
      const dependencies = manifest[section] ?? {};
      return Object.keys(dependencies).flatMap((dependency) => {
        if (!forbiddenSocialAuthPackages.has(dependency)) return [];

        return [
          {
            command: "social auth forbidden dependency guard",
            file: relativeFile,
            status: 1,
            stdout: "",
            stderr: `Found forbidden social-auth dependency ${dependency} in ${section}. Use @tma.js, grammY, and the approved Discord stack instead.`,
          },
        ];
      });
    });
  });
}

export function checkProviderScopedRuntimeImports(workspaceRoot: string): CheckFailure[] {
  const roots = [
    "apps/backend",
    "libs/backend/common",
    "libs/backend/feature",
  ];
  const providerImport =
    /(?:@app\/backend-(?:mongodb|postgres)|from\s+["'](?:mongodb|mongodb-connection-string-url|pg|@mikro-orm\/[^"']+)["']|require\(["']pg["']\)|better-auth\/adapters\/mongodb)/u;

  return roots.flatMap((root) => {
    const absoluteRoot = resolve(workspaceRoot, root);
    if (!existsSync(absoluteRoot)) return [];
    return walk(absoluteRoot).flatMap((absoluteFile) => {
      const file = relativeToWorkspace(workspaceRoot, absoluteFile);
      if (
        !absoluteFile.endsWith(".ts") ||
        file.includes("/node_modules/") ||
        file.endsWith("/capabilities.generated.ts") ||
        file.startsWith("libs/backend/common/component-test/") ||
        file.startsWith("libs/backend/feature/auth/test/")
      ) {
        return [];
      }
      const content = readFileSync(absoluteFile, "utf8");
      if (!providerImport.test(content)) return [];
      return [{
        command: "provider-scoped runtime import boundary",
        file,
        status: 1,
        stdout: "",
        stderr: `Provider-neutral project source imports a database provider or driver and can pollute its Nx package closure: ${file}`,
      }];
    });
  });
}

export function checkTrackedSocialAuthSecrets(
  workspaceRoot: string,
): CheckFailure[] {
  return collectStaleReferenceTargets(workspaceRoot).flatMap((file) => {
    const relativeFile = relativeToWorkspace(workspaceRoot, file);
    const text = readFileSync(file, "utf8");
    const failures: CheckFailure[] = [];

    for (const secretPattern of socialAuthSecretPatterns) {
      secretPattern.regex.lastIndex = 0;
      for (const match of text.matchAll(secretPattern.regex)) {
        const rawValue = match[0];
        if (isAllowedSocialAuthSecretPlaceholder(rawValue, relativeFile, text, match.index ?? 0)) {
          continue;
        }

        const line = text.slice(0, match.index).split("\n").length;
        if (isKnownSocialAuthSecretFinding(failures, relativeFile, line)) continue;
        failures.push({
          command: "social auth tracked secret guard",
          file: `${relativeFile}:${line}`,
          status: 1,
          stdout: "",
          stderr: `Found ${secretPattern.id} shaped secret in a tracked text file. Replace it with a placeholder or secret-file reference.`,
        });
      }
    }

    return failures;
  });
}

export function checkThinLocaleCatalogs(workspaceRoot: string): CheckFailure[] {
  const i18nRoot = join(workspaceRoot, "i18n");
  const failures: CheckFailure[] = [];
  // The default locale is the namespace source of truth, the same choice the catalog binding
  // generator makes, so a namespace present only in a translation is still reported as unexpected
  // and one missing from a translation is still reported as missing.
  const expectedFiles = discoverCatalogNamespaces(workspaceRoot, defaultLocale).sort(
    (left, right) => left.localeCompare(right),
  );

  for (const locale of supportedLocales) {
    const localeDirectory = join(i18nRoot, locale);
    if (!existsSync(localeDirectory)) {
      failures.push(thinLocaleFailure(`i18n/${locale}`, "missing locale directory"));
      continue;
    }

    const actualFiles = collectLocaleJsonFiles(localeDirectory).sort(
      (left, right) => left.localeCompare(right),
    );

    for (const missingFile of expectedFiles.filter(
      (file) => !actualFiles.includes(file),
    )) {
      failures.push(
        thinLocaleFailure(`i18n/${locale}/${missingFile}`, "missing thin locale file"),
      );
    }

    // Metadata is recognised by shape — a catalog is always `<scope>/<file>.json`, so anything at
    // the locale root describes the locale rather than translating it. Matching one hardcoded name
    // meant a product's review ledger failed a merge-blocking gate.
    for (const extraFile of actualFiles.filter(
      (file) => !isLocaleMetadataFile(file) && !expectedFiles.includes(file),
    )) {
      failures.push(
        thinLocaleFailure(`i18n/${locale}/${extraFile}`, "unexpected locale JSON file"),
      );
    }
  }

  const localeKeys = new Map<string, Set<string>>();
  const localeValues = new Map<string, Map<string, string>>();

  for (const locale of supportedLocales) {
    const mergedKeys = new Set<string>();
    const mergedValues = new Map<string, string>();
    localeValues.set(locale, mergedValues);
    const localeDirectory = join(i18nRoot, locale);
    if (!existsSync(localeDirectory)) continue;

    for (const fileName of expectedFiles) {
      const relativeFile = `i18n/${locale}/${fileName}`;
      const file = join(localeDirectory, fileName);
      if (!existsSync(file)) continue;

      const text = readFileSync(file, "utf8");
      const nonEmptyLineCount = text
        .split("\n")
        .filter((line) => line.trim().length > 0).length;
      if (nonEmptyLineCount > thinLocaleCatalogMaxNonEmptyLines) {
        failures.push(
          thinLocaleFailure(
            relativeFile,
            `has ${nonEmptyLineCount} non-empty lines; limit is ${thinLocaleCatalogMaxNonEmptyLines}`,
          ),
        );
      }

      for (const duplicateKey of duplicateEnvKeys(readRawJsonObjectKeys(text))) {
        failures.push(
          thinLocaleFailure(relativeFile, `duplicate raw JSON key ${duplicateKey}`),
        );
      }

      let catalog: unknown;
      try {
        catalog = JSON.parse(text) as unknown;
      } catch (error) {
        failures.push(thinLocaleFailure(relativeFile, `invalid JSON: ${String(error)}`));
        continue;
      }

      if (!catalog || Array.isArray(catalog) || typeof catalog !== "object") {
        failures.push(
          thinLocaleFailure(relativeFile, "locale file must be a flat JSON object"),
        );
        continue;
      }

      const entries = Object.entries(catalog as Record<string, unknown>);
      if (entries.length > thinLocaleCatalogMaxKeys) {
        failures.push(
          thinLocaleFailure(
            relativeFile,
            `has ${entries.length} keys; limit is ${thinLocaleCatalogMaxKeys}`,
          ),
        );
      }

      for (const [key, value] of entries) {
        if (typeof value !== "string") {
          failures.push(
            thinLocaleFailure(relativeFile, `key ${key} must have a string value`),
          );
        }

        if (
          !relativeFile.includes("/bots/") &&
          (key.startsWith("bot.") || key.startsWith("discord."))
        ) {
          failures.push(
            thinLocaleFailure(
              relativeFile,
              `bot/Discord key ${key} must stay under the bots scope`,
            ),
          );
        }

        if (mergedKeys.has(key)) {
          failures.push(
            thinLocaleFailure(relativeFile, `duplicate merged locale key ${key}`),
          );
        }
        mergedKeys.add(key);
        if (typeof value === "string") mergedValues.set(key, value);
      }
    }

    localeKeys.set(locale, mergedKeys);
  }

  const fallbackKeys = localeKeys.get(defaultLocale) ?? new Set<string>();
  for (const [locale, keys] of localeKeys.entries()) {
    const missingKeys = [...fallbackKeys].filter((key) => !keys.has(key));
    const extraKeys = [...keys].filter((key) => !fallbackKeys.has(key));

    if (missingKeys.length > 0) {
      failures.push(
        thinLocaleFailure(
          `i18n/${locale}`,
          `missing fallback locale keys: ${missingKeys
            .sort((left, right) => left.localeCompare(right))
            .join(", ")}`,
        ),
      );
    }

    if (extraKeys.length > 0) {
      failures.push(
        thinLocaleFailure(
          `i18n/${locale}`,
          `has keys absent from fallback locale: ${extraKeys
            .sort((left, right) => left.localeCompare(right))
            .join(", ")}`,
        ),
      );
    }

    failures.push(...placeholderParityFailures(locale, localeValues));
    failures.push(...localeProseFailures(i18nRoot, locale, localeValues));
  }

  return failures;
}

interface LocaleLintRules {
  readonly residuePatterns: readonly { readonly regex: RegExp; readonly label: string }[];
  readonly foreignProseMarkers: readonly string[];
  readonly reviewedTechnicalTerms: readonly string[];
  readonly untranslatedKeys: ReadonlySet<string>;
}

const localeLintRuleKeys = [
  "residuePatterns",
  "foreignProseMarkers",
  "reviewedTechnicalTerms",
  "untranslatedKeys",
] as const;

/**
 * Key parity and placeholder parity both pass on a catalog that was never actually translated —
 * the keys are there and the placeholders match, because the values are still English. These rules
 * catch that, but only for a locale that declared what "still English" means for it.
 */
function localeProseFailures(
  i18nRoot: string,
  locale: string,
  localeValues: Map<string, Map<string, string>>,
): CheckFailure[] {
  const relativeRuleFile = `i18n/${locale}/${localeLintRuleFileName}`;
  const ruleFile = join(i18nRoot, locale, localeLintRuleFileName);
  if (!existsSync(ruleFile)) {
    if (locale === defaultLocale) return [];
    // An absent rule set is how a locale opts out of prose linting entirely, silently. Requiring the
    // declaration means even an empty `{}` keeps the identical-to-fallback rule, and a locale that
    // needs orthography or foreign-prose rules has one obvious place to put them.
    return [
      thinLocaleFailure(
        relativeRuleFile,
        `${relativeRuleFile}: locale must declare its prose rules; an empty object is a valid start`,
      ),
    ];
  }

  const loaded = loadLocaleLintRules(readFileSync(ruleFile, "utf8"));
  if (typeof loaded === "string") {
    // A rule set that cannot be honoured is named in the message itself: silently skipping it would
    // turn a typo into a locale that quietly stops being linted at all.
    return [thinLocaleFailure(relativeRuleFile, `${relativeRuleFile}: ${loaded}`)];
  }

  const fallbackValues = localeValues.get(defaultLocale) ?? new Map<string, string>();
  const values = localeValues.get(locale) ?? new Map<string, string>();
  const failures: CheckFailure[] = [];

  for (const [key, value] of values) {
    // A term the locale keeps in its source form is not evidence of an untranslated string, so it
    // is removed before the prose rules look at what is left.
    const residual = loaded.reviewedTechnicalTerms.reduce(
      (text, term) => text.replaceAll(new RegExp(escapeRegExp(term), "giu"), " "),
      withoutInterpolation(value),
    );

    for (const { regex, label } of loaded.residuePatterns) {
      regex.lastIndex = 0;
      if (regex.test(residual)) failures.push(thinLocaleFailure(relativeRuleFile, `${key}: ${label}`));
    }

    const markers = loaded.foreignProseMarkers.filter((marker) =>
      new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(marker)}(?![\\p{L}\\p{N}_])`, "iu").test(residual),
    );
    if (markers.length > 0) {
      failures.push(
        thinLocaleFailure(relativeRuleFile, `${key}: untranslated prose (${markers.join(", ")})`),
      );
    }

    if (locale === defaultLocale || loaded.untranslatedKeys.has(key)) continue;
    if (fallbackValues.get(key) === value) {
      failures.push(thinLocaleFailure(relativeRuleFile, `${key}: identical to the fallback locale`));
    }
  }

  return failures;
}

/** Returns the compiled rules, or the reason the declaration cannot be honoured. */
function loadLocaleLintRules(text: string): LocaleLintRules | string {
  let declaration: unknown;
  try {
    declaration = JSON.parse(text) as unknown;
  } catch (error) {
    return `invalid JSON: ${String(error)}`;
  }
  if (!declaration || Array.isArray(declaration) || typeof declaration !== "object") {
    return "locale lint rules must be a JSON object";
  }

  const record = declaration as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter(
    (key) => !localeLintRuleKeys.includes(key as (typeof localeLintRuleKeys)[number]),
  );
  if (unknownKeys.length > 0) {
    return `unknown locale lint rule ${unknownKeys.sort((left, right) => left.localeCompare(right)).join(", ")}`;
  }

  const residuePatterns: { regex: RegExp; label: string }[] = [];
  const rawResiduePatterns = record["residuePatterns"] ?? [];
  if (!Array.isArray(rawResiduePatterns)) return "residuePatterns must be an array";
  for (const entry of rawResiduePatterns) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return "every residuePatterns entry must be an object with pattern and label";
    }
    const { pattern, label } = entry as Record<string, unknown>;
    if (typeof pattern !== "string" || typeof label !== "string" || label.trim() === "") {
      return "every residuePatterns entry must be an object with pattern and label";
    }
    try {
      residuePatterns.push({ regex: new RegExp(pattern, "u"), label });
    } catch (error) {
      return `residue pattern ${pattern} is not a valid regular expression: ${String(error)}`;
    }
  }

  const stringList = (key: (typeof localeLintRuleKeys)[number]): string[] | string => {
    const raw = record[key] ?? [];
    if (!Array.isArray(raw) || raw.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
      return `${key} must be an array of non-empty strings`;
    }
    return raw as string[];
  };

  const foreignProseMarkers = stringList("foreignProseMarkers");
  if (typeof foreignProseMarkers === "string") return foreignProseMarkers;
  const reviewedTechnicalTerms = stringList("reviewedTechnicalTerms");
  if (typeof reviewedTechnicalTerms === "string") return reviewedTechnicalTerms;
  const untranslatedKeys = stringList("untranslatedKeys");
  if (typeof untranslatedKeys === "string") return untranslatedKeys;

  return {
    foreignProseMarkers,
    // Longest first, so a term that contains another is removed whole rather than shredded.
    reviewedTechnicalTerms: [...reviewedTechnicalTerms].sort((left, right) => right.length - left.length),
    residuePatterns,
    untranslatedKeys: new Set(untranslatedKeys),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * Key parity cannot see the most common translation defect there is: a translator who keeps the
 * key but drops or renames `{{count}}`. The result renders a literal placeholder or a missing
 * value to the user and passes every other gate, because the key exists in both catalogs.
 */
function placeholderParityFailures(
  locale: string,
  localeValues: Map<string, Map<string, string>>,
): CheckFailure[] {
  if (locale === defaultLocale) return [];

  const fallbackValues = localeValues.get(defaultLocale) ?? new Map<string, string>();
  const values = localeValues.get(locale) ?? new Map<string, string>();
  const failures: CheckFailure[] = [];

  for (const [key, fallbackValue] of fallbackValues) {
    const value = values.get(key);
    if (value === undefined) continue;

    const expected = translationPlaceholders(fallbackValue);
    const actual = translationPlaceholders(value);
    if (expected.join(" ") === actual.join(" ")) continue;

    failures.push(
      thinLocaleFailure(
        `i18n/${locale}`,
        `placeholder mismatch for ${key}: expected ${formatPlaceholders(expected)}, received ${formatPlaceholders(actual)}`,
      ),
    );
  }

  return failures;
}

/**
 * A message with its interpolation removed.
 *
 * Placeholder names are ASCII identifiers a developer chose; they are machinery, never prose, and
 * leaving them in broke the prose rules in both directions. A non-Latin locale could not declare the
 * rule it means -- `[A-Za-z]` would fire on every message carrying any placeholder, which is why the
 * shipped Russian rules had to spell it as a Latin/Cyrillic adjacency hack -- and a marker word that
 * collides with a placeholder name (`{{error}}`) could not be silenced at all, since listing it as a
 * reviewed term would also stop it matching real prose.
 *
 * Each match becomes a space so neighbouring words do not fuse into one, and the replacement runs to
 * a fixed point because a nested construct such as `{{outer{inner}tail}}` survives a single pass.
 */
function withoutInterpolation(value: string): string {
  let text = value;
  for (;;) {
    const stripped = text.replace(/\{[^{}]*\}/gu, " ");
    if (stripped === text) return text;
    text = stripped;
  }
}

/** The distinct `{{name}}` placeholders in a message, sorted so reordering is not a defect. */
function translationPlaceholders(value: string): string[] {
  return [
    ...new Set(
      [...value.matchAll(/\{\{\s*([\p{L}\p{N}_.-]+)\s*\}\}/gu)].map(
        (match) => match[1] ?? "",
      ),
    ),
  ]
    .filter((name) => name.length > 0)
    .sort((left, right) => left.localeCompare(right));
}

function formatPlaceholders(names: string[]): string {
  return names.length === 0 ? "none" : names.map((name) => `{{${name}}}`).join(", ");
}

function collectLocaleJsonFiles(localeDirectory: string): string[] {
  const visit = (directory: string): string[] =>
    readdirSync(directory).flatMap((entry) => {
      const path = join(directory, entry);
      const stat = statSync(path);

      if (stat.isDirectory()) {
        return visit(path).map((nestedFile) => `${entry}/${nestedFile}`);
      }

      return stat.isFile() && entry.endsWith(".json") && entry !== "project.json"
        ? [entry]
        : [];
    });

  return visit(localeDirectory);
}

function readRawJsonObjectKeys(text: string): string[] {
  return text.split("\n").flatMap((line) => {
    const match = /^\s*"((?:\\.|[^"\\])+)"\s*:/u.exec(line);
    if (!match?.[1]) return [];

    try {
      return [JSON.parse(`"${match[1]}"`) as string];
    } catch {
      return [match[1]];
    }
  });
}

function thinLocaleFailure(file: string, stderr: string): CheckFailure {
  return {
    command: "thin locale catalog guard",
    file,
    status: 1,
    stdout: "",
    stderr,
  };
}

const translationKeyUnionSource = "libs/common/i18n/keys/lib/src/index.ts";

// The generated TranslationKey union and the runtime en catalogs are separate sources of truth, so a
// typo or removal in either drifts silently (catalogs are Record<string, string>). Fail on drift in
// either direction.
//
// The catalog set comes from the same discovery the union's generator uses. Walking every JSON under
// the locale instead pulled locale-root metadata (`lint.json`, a review ledger) in as a catalog and
// demanded its top-level keys join the union — which regenerating can never do, since the generator
// excludes metadata, and hand-adding them makes the module report as stale.
export function checkTranslationKeyDrift(workspaceRoot: string): CheckFailure[] {
  const localeDirectory = join(workspaceRoot, "i18n", defaultLocale);
  const keysSource = resolve(workspaceRoot, translationKeyUnionSource);
  if (!existsSync(localeDirectory) || !existsSync(keysSource)) return [];

  const catalogKeys = new Set<string>();
  for (const relativeFile of discoverLocaleCatalogFiles(workspaceRoot, defaultLocale)) {
    let catalog: unknown;
    try {
      catalog = JSON.parse(
        readFileSync(join(localeDirectory, relativeFile), "utf8"),
      ) as unknown;
    } catch {
      // JSON validity is enforced by checkThinLocaleCatalogs.
      continue;
    }
    if (catalog && typeof catalog === "object" && !Array.isArray(catalog)) {
      for (const key of Object.keys(catalog)) catalogKeys.add(key);
    }
  }

  const unionKeys = readTranslationKeyUnion(keysSource);
  const catalogOnly = [...catalogKeys]
    .filter((key) => !unionKeys.has(key))
    .sort((left, right) => left.localeCompare(right));
  const unionOnly = [...unionKeys]
    .filter((key) => !catalogKeys.has(key))
    .sort((left, right) => left.localeCompare(right));

  const failures: CheckFailure[] = [];
  if (catalogOnly.length > 0) {
    failures.push({
      command: "i18n translation key drift",
      file: translationKeyUnionSource,
      status: 1,
      stdout: "",
      stderr: `TranslationKey union is missing ${catalogOnly.length} key(s) present in i18n/en catalogs: ${catalogOnly.join(", ")}. Add them to the union.`,
    });
  }
  if (unionOnly.length > 0) {
    failures.push({
      command: "i18n translation key drift",
      file: translationKeyUnionSource,
      status: 1,
      stdout: "",
      stderr: `TranslationKey union has ${unionOnly.length} key(s) absent from i18n/en catalogs: ${unionOnly.join(", ")}. Remove them from the union or add the catalog entries.`,
    });
  }

  return failures;
}

function readTranslationKeyUnion(keysSource: string): Set<string> {
  const text = readFileSync(keysSource, "utf8");
  const declarationStart = text.indexOf("=");
  const body = declarationStart >= 0 ? text.slice(declarationStart) : text;
  return new Set(
    [...body.matchAll(/["']([^"']+)["']/gu)].map((match) => match[1] ?? ""),
  );
}

export function checkPackageProjectReferences(
  workspaceRoot: string,
): CheckFailure[] {
  const workspaceProjects = collectWorkspaceProjects(workspaceRoot);

  return ["package.json"].flatMap((owner) => {
    const packageJson = readPackageJson(workspaceRoot, owner);
    const scripts = packageJson.scripts ?? {};

    return Object.entries(scripts).flatMap(([script, command]) =>
      projectReferencePatterns.flatMap((reference) => {
        if (!reference.packageScriptPattern.test(command)) return [];
        if (workspaceProjects.has(reference.projectName)) return [];

        return [
          {
            command: `package.json project reference ${owner}#${script}`,
            file: owner,
            status: 1,
            stdout: "",
            stderr: `Missing Nx project for ${reference.label}: ${reference.projectName}`,
          },
        ];
      }),
    );
  });
}

function collectWorkspaceProjects(workspaceRoot: string): Set<string> {
  const projects = new Set<string>();

  for (const projectFile of walkProjectJsonFiles(workspaceRoot)) {
    const project = readProjectJson(projectFile);
    if (project.name) projects.add(project.name);
  }

  return projects;
}

function walkProjectJsonFiles(workspaceRoot: string): string[] {
  const files: string[] = [];

  const visit = (directory: string): void => {
    if (!existsSync(directory)) return;

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (
          staleReferenceIgnoredDirectories.has(entry.name) ||
          isLocalWorktreePath(workspaceRoot, entryPath)
        ) continue;
        visit(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name === "project.json") {
        files.push(entryPath);
      }
    }
  };

  visit(workspaceRoot);
  return files;
}

function readProjectJson(projectFile: string): { name?: string } {
  return JSON.parse(readFileSync(projectFile, "utf8")) as { name?: string };
}

function isImportBoundaryLine(line: string): boolean {
  return (
    /^\s*(?:import|export)\b/u.test(line) || /\b(?:import|require)\s*\(/u.test(line)
  );
}

function isKnownSocialAuthSecretFinding(
  failures: CheckFailure[],
  file: string,
  line: number,
): boolean {
  return failures.some((failure) => failure.file === `${file}:${line}`);
}

function isAllowedSocialAuthSecretPlaceholder(
  value: string,
  file: string,
  text: string,
  index: number,
): boolean {
  if (/example|sample|fixture|test|dummy|changeme|placeholder|local|set-/iu.test(value)) {
    return true;
  }
  if (file === "packages/tooling/src/commands/tooling/static-check.test.ts") return true;

  const lineStart = text.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
  const lineEnd = text.indexOf("\n", index);
  const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);

  return /^\s*#/u.test(line);
}

function collectGeneratedContractImportTargets(workspaceRoot: string): string[] {
  return collectStaleReferenceTargets(workspaceRoot).filter((file) =>
    generatedContractImportExtensions.has(extname(file).toLowerCase()),
  );
}

function collectPackageManifests(workspaceRoot: string): string[] {
  return collectStaleReferenceTargets(workspaceRoot).filter((file) =>
    file.endsWith("package.json"),
  );
}

export function checkEnvExampleConsistency(workspaceRoot: string): CheckFailure[] {
  const envKeys = readEnvExampleKeys(resolve(workspaceRoot, "./.env.example"));
  const localEnvKeys = readEnvExampleKeys(resolve(workspaceRoot, "./.env.local.example"));
  const failures: CheckFailure[] = [];

  for (const file of [
    "./.env.example",
    "./.env.local.example",
    "./.env.production.example",
    "./.env.staging.example",
    "./.env.test.example",
  ]) {
    const absolutePath = resolve(workspaceRoot, file);
    if (!existsSync(absolutePath)) continue;
    for (const duplicate of duplicateEnvKeys(readEnvExampleKeys(absolutePath))) {
      failures.push(envExampleFailure(file, `Duplicate env key: ${duplicate}.`));
    }
  }

  const maxLength = Math.max(envKeys.length, localEnvKeys.length);
  for (let index = 0; index < maxLength; index += 1) {
    if (envKeys[index] === localEnvKeys[index]) continue;

    failures.push(
      envExampleFailure(
        "./.env.example / ./.env.local.example",
        `.env.example and .env.local.example must keep identical active key order. First mismatch at position ${index + 1}: ${envKeys[index] ?? "<missing>"} !== ${localEnvKeys[index] ?? "<missing>"}.`,
      ),
    );
    break;
  }

  return failures;
}

function duplicateEnvKeys(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicateValues = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicateValues.add(value);
    seen.add(value);
  }
  return [...duplicateValues].sort((left, right) => left.localeCompare(right));
}

function readEnvExampleKeys(file: string): string[] {
  return readFileSync(file, "utf8")
    .split(/\r?\n/u)
    .flatMap((line) => {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=/u.exec(line);
      return match?.[1] ? [match[1]] : [];
    });
}

function envExampleFailure(file: string, message: string): CheckFailure {
  return {
    command: "env example consistency",
    file,
    status: 1,
    stdout: "",
    stderr: message,
  };
}

export function checkStaleReferences(workspaceRoot: string): CheckFailure[] {
  const archivePrefixes = staleReferenceArchivePrefixes(workspaceRoot);

  return collectStaleReferenceTargets(workspaceRoot).flatMap((file) => {
    const relativeFile = relativeToWorkspace(workspaceRoot, file);
    if (archivePrefixes.some((prefix) => relativeFile.startsWith(prefix))) return [];
    const text = readFileSync(file, "utf8");
    const failures: CheckFailure[] = [];

    text.split(/\r?\n/u).forEach((line, index) => {
      for (const staleReference of staleReferencePatterns) {
        if (!staleReference.pattern.test(line)) continue;

        failures.push({
          command: "stale architecture/version denylist",
          file: `${relativeFile}:${index + 1}`,
          status: 1,
          stdout: "",
          stderr: `Found ${staleReference.label}. Use current product-neutral, exception/swagger, backend Postgres path/alias, Problem Details RFC9457, Node >=24 <25, and pnpm 11.15.1 references.`,
        });
      }
    });

    return failures;
  });
}

function collectStaleReferenceTargets(workspaceRoot: string): string[] {
  const files: string[] = [];

  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const entryPath = join(directory, entry.name);
        if (
          staleReferenceIgnoredDirectories.has(entry.name) ||
          isLocalWorktreePath(workspaceRoot, entryPath)
        ) continue;
        visit(entryPath);
        continue;
      }

      if (!entry.isFile()) continue;

      const file = join(directory, entry.name);
      const relativeFile = relativeToWorkspace(workspaceRoot, file);

      if (staleReferenceIgnoredFiles.has(relativeFile)) continue;
      if (file.endsWith(".tsbuildinfo")) continue;
      if (!staleReferenceExtensions.has(extname(file).toLowerCase())) continue;

      files.push(file);
    }
  }

  visit(workspaceRoot);
  return files.sort((left, right) => left.localeCompare(right));
}

/**
 * Every executable spec under `scripts/` must be run by some root package.json script.
 *
 * The enumerated `test:deploy` named eleven of the sixteen, and no CI lane invoked it, so five
 * repository specs were dead weight -- among them the one guarding the runtime stack's start
 * sequence. A hand-kept list is the failure mode, so a glob satisfies this rule and a list only
 * satisfies it for exactly the files it happens to name.
 */
export function checkRepositoryScriptSpecCoverage(workspaceRoot: string): CheckFailure[] {
  const commands = Object.values(rootPackageScripts(workspaceRoot));

  return collectRepositoryScriptSpecs(workspaceRoot)
    .filter((spec) => !commands.some((command) => commandRunsPath(command, spec)))
    .map((spec) => ({
      command: "repository script spec coverage",
      file: spec,
      status: 1,
      stdout: "",
      stderr: `Spec is never executed: no root package.json script runs it. Have a script discover it, for example \`node --test "scripts/**/*.spec.mjs"\`.`,
    }));
}

function rootPackageScripts(workspaceRoot: string): Record<string, string> {
  const manifestPath = join(workspaceRoot, "package.json");
  if (!existsSync(manifestPath)) return {};
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { scripts?: Record<string, string> };
  return manifest.scripts ?? {};
}

/** Whether a shell command names a workspace-relative path, either outright or through a glob. */
function commandRunsPath(command: string, path: string): boolean {
  return command
    .split(/\s+/u)
    .map((token) => token.replace(/^['"]|['"]$/gu, ""))
    .some((token) => {
      if (token === path) return true;
      // A token is any argument, including flags: `--test-concurrency=2` is not a pattern, and
      // matchesGlob rejects some of them outright rather than reporting no match.
      try {
        return matchesGlob(path, token);
      } catch {
        return false;
      }
    });
}

function collectRepositoryScriptSpecs(workspaceRoot: string): string[] {
  const specs: string[] = [];

  function visit(directory: string): void {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }
      if (entry.isFile() && /\.spec\.m?js$/u.test(entry.name)) {
        specs.push(relativeToWorkspace(workspaceRoot, entryPath));
      }
    }
  }

  visit(join(workspaceRoot, "scripts"));
  return specs.sort((left, right) => left.localeCompare(right));
}

function toPackageScriptFailure(failure: ReferencedScript): CheckFailure {
  return {
    command: `package.json script reference ${failure.owner}#${failure.script}`,
    file: failure.owner,
    status: 1,
    stdout: "",
    stderr: `Missing referenced script path: ${failure.reference} -> ${failure.path}`,
  };
}

function reportFailures(failures: CheckFailure[]): void {
  console.error("Tooling static validation failed:");

  for (const failure of failures) {
    console.error(`- command: ${failure.command}`);
    if (failure.file) console.error(`  file: ${failure.file}`);
    console.error(`  exitCode: ${failure.status}`);
    if (failure.stderr) console.error(`  stderr: ${tail(failure.stderr)}`);
    if (failure.stdout) console.error(`  stdout: ${tail(failure.stdout)}`);
    if (failure.error) console.error(`  error: ${failure.error}`);
  }
}

export function runChangedFormatCheck(
  options: ChangedFormatCheckOptions = {},
): number {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const parsed = parseArgs(options.argv ?? []);
  const base =
    parsed.options.get("base") ?? process.env.FORMAT_BASE_REF ?? "origin/main";
  const head =
    parsed.options.get("head") ?? process.env.FORMAT_HEAD_REF ?? "HEAD";
  ensureFormatBaseRef(workspaceRoot, base);

  const mergeBaseResult = run("git", ["merge-base", base, head], {
    cwd: workspaceRoot,
  });

  if (mergeBaseResult.status !== 0) {
    console.error(`Unable to determine merge-base for ${base} and ${head}.`);
    if (mergeBaseResult.stderr) console.error(tail(mergeBaseResult.stderr));
    return mergeBaseResult.status;
  }

  const mergeBase = mergeBaseResult.stdout.trim();
  const changedResult = run(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMR", `${mergeBase}...${head}`],
    { cwd: workspaceRoot },
  );

  if (changedResult.status !== 0) {
    console.error("Unable to list changed files for formatting check.");
    if (changedResult.stderr) console.error(tail(changedResult.stderr));
    return changedResult.status;
  }

  const files = changedResult.stdout
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean)
    .filter(isPrettierCandidate);

  if (files.length === 0) {
    console.log(JSON.stringify({ status: "ok", checkedFiles: 0, base, head }));
    return 0;
  }

  const result = run(
    "pnpm",
    ["exec", "prettier", "--check", "--ignore-unknown", ...files],
    { cwd: workspaceRoot, stdio: "inherit" },
  );

  if (result.status !== 0) return result.status;

  console.log(
    JSON.stringify({ status: "ok", checkedFiles: files.length, base, head }),
  );
  return 0;
}

function ensureFormatBaseRef(workspaceRoot: string, base: string): void {
  const revParse = run("git", ["rev-parse", "--verify", `${base}^{commit}`], {
    cwd: workspaceRoot,
  });

  if (revParse.status === 0 || !base.startsWith("origin/")) return;

  const branch = base.slice("origin/".length);
  run("git", ["fetch", "--depth=1", "origin", `${branch}:refs/remotes/${base}`], {
    cwd: workspaceRoot,
  });
}

function collectToolingModuleScripts(workspaceRoot: string): string[] {
  return [
    ...walk(resolve(workspaceRoot, "packages/tooling/bin")),
    // src/plugins holds directly executed .mjs entries (the typecheck plugin),
    // which the CLI's lazy jiti loading never parses for unrelated commands.
    ...walk(resolve(workspaceRoot, "packages/tooling/src/plugins")),
    ...walk(resolve(workspaceRoot, "scripts")),
  ]
    .filter((path) => path.endsWith(".mjs"))
    .sort((left, right) => left.localeCompare(right));
}

function walk(root: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    // lstat, not stat: after `nrb closure install` the per-app node_modules are symlinks into
    // .nrb/closure, whose pnpm links point back at the workspace. Following them recursed until
    // the stack overflowed. Matches the walkers in commands/project/check-library-configs.ts.
    const stat = lstatSync(path);

    if (stat.isSymbolicLink()) {
      continue;
    }

    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") {
        continue;
      }

      files.push(...walk(path));
    } else if (stat.isFile()) {
      files.push(path);
    }
  }

  return files;
}

function checkPackageScriptReferences(
  workspaceRoot: string,
): ReferencedScript[] {
  return ["package.json", "packages/tooling/package.json"].flatMap((owner) => {
    const packageJson = readPackageJson(workspaceRoot, owner);
    const scripts = packageJson.scripts ?? {};

    return Object.entries(scripts).flatMap(([script, command]) => [
      ...findMissingPathReferences(workspaceRoot, owner, script, command),
      ...findMissingScriptReferences(owner, scripts, script, command),
    ]);
  });
}

function readPackageJson(
  workspaceRoot: string,
  owner: string,
): { scripts?: Record<string, string> } {
  return JSON.parse(readFileSync(resolve(workspaceRoot, owner), "utf8")) as {
    scripts?: Record<string, string>;
  };
}

function findMissingPathReferences(
  workspaceRoot: string,
  owner: string,
  script: string,
  command: string,
): ReferencedScript[] {
  return [
    ...extractPathReferences(command, nodeScriptReference),
    ...extractPathReferences(command, shellScriptReference),
  ].flatMap((reference) => {
    const path = normalizeReference(reference);
    const absolutePath = resolve(workspaceRoot, owner, "..", path);

    if (statExists(absolutePath)) return [];

    return [
      {
        owner,
        script,
        reference,
        path: relativeToWorkspace(workspaceRoot, absolutePath),
      },
    ];
  });
}

function findMissingScriptReferences(
  owner: string,
  scripts: Record<string, string>,
  script: string,
  command: string,
): ReferencedScript[] {
  return extractScriptReferences(command).flatMap((referencedScript) => {
    if (Object.hasOwn(scripts, referencedScript)) return [];

    return [
      {
        owner,
        script,
        reference: `pnpm run ${referencedScript}`,
        path: `${owner}#scripts.${referencedScript}`,
      },
    ];
  });
}

function countPackageScriptReferences(workspaceRoot: string): number {
  return ["package.json", "packages/tooling/package.json"].reduce(
    (count, packageJsonPath) => {
      const packageJson = JSON.parse(
        readFileSync(resolve(workspaceRoot, packageJsonPath), "utf8"),
      ) as { scripts?: Record<string, string> };
      return (
        count +
        Object.values(packageJson.scripts ?? {}).reduce(
          (innerCount, command) =>
            innerCount +
            extractPathReferences(command, nodeScriptReference).length +
            extractPathReferences(command, shellScriptReference).length +
            extractScriptReferences(command).length,
          0,
        )
      );
    },
    0,
  );
}

function extractPathReferences(command: string, pattern: RegExp): string[] {
  pattern.lastIndex = 0;
  return [...command.matchAll(pattern)].map((match) => match[1] ?? "");
}

function extractScriptReferences(command: string): string[] {
  pnpmRunReference.lastIndex = 0;
  return [...command.matchAll(pnpmRunReference)].map((match) => match[1] ?? "");
}

function normalizeReference(reference: string): string {
  return reference.replace(/^['"]|['"]$/g, "");
}

function statExists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function relativeToWorkspace(workspaceRoot: string, path: string): string {
  return relative(workspaceRoot, path).replaceAll("\\", "/");
}

function isLocalWorktreePath(workspaceRoot: string, path: string): boolean {
  const relativePath = relativeToWorkspace(workspaceRoot, path);
  return relativePath === ".claude/worktrees" || relativePath.startsWith(localWorktreePrefix);
}

function isPrettierCandidate(file: string): boolean {
  if (
    /(^|\/)(node_modules|dist|coverage|test-results|playwright-report|\.nx|\.cache|tmp)(\/|$)/u.test(
      file,
    )
  ) {
    return false;
  }
  if (file === "pnpm-lock.yaml" || file.endsWith(".tsbuildinfo")) return false;
  return new Set([
    "",
    ".cjs",
    ".css",
    ".html",
    ".js",
    ".json",
    ".jsx",
    ".md",
    ".mjs",
    ".mts",
    ".scss",
    ".ts",
    ".tsx",
    ".yaml",
    ".yml",
  ]).has(extname(file).toLowerCase());
}

function parseArgs(argv: string[]): {
  flags: Set<string>;
  options: Map<string, string>;
} {
  const flags = new Set<string>();
  const options = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index] ?? "";
    if (!value.startsWith("--")) continue;
    const raw = value.slice(2);
    const equals = raw.indexOf("=");
    if (equals >= 0) {
      options.set(raw.slice(0, equals), raw.slice(equals + 1));
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      options.set(raw, next);
      index += 1;
    } else {
      flags.add(raw);
    }
  }
  return { flags, options };
}

function tail(value: string, max = 2000): string {
  return value.length > max ? value.slice(-max) : value;
}
