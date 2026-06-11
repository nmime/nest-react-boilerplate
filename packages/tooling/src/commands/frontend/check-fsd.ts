import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve, sep } from "node:path";

export interface CheckFrontendFsdOptions {
  argv?: string[];
  workspaceRoot?: string;
}

interface ProjectInfo {
  name: string;
  slice: string;
  projectRoot: string;
  sourceRoot: string;
  tags: string[];
  fsdLayer?: FsdLayer;
}

interface ModuleInfo {
  layer: FsdLayer;
  slice: string;
  project?: ProjectInfo;
  sourceRoot: string;
  publicApi: string;
  path: string;
}

interface ImportReference {
  specifier: string;
  line: number;
}

interface Violation {
  file: string;
  line?: number;
  code: string;
  message: string;
}

const fsdLayers = [
  "app",
  "pages",
  "widgets",
  "features",
  "entities",
  "shared",
] as const;
type FsdLayer = (typeof fsdLayers)[number];

const layerRank: Record<FsdLayer, number> = {
  shared: 0,
  entities: 1,
  features: 2,
  widgets: 3,
  pages: 4,
  app: 5,
};

const frontendRoots = ["apps/frontend", "libs/frontend"];
const sourceExtensions = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
];
const frontendSourceExtensions = new Set(sourceExtensions);
const boundaryDisablePattern =
  /eslint-disable(?:-next-line|-line)?[^\n]*(?:@nx\/enforce-module-boundaries|import\/no-internal-modules|no-restricted-imports|frontend[:-]fsd|fsd)/;
const importSpecifierPattern = /["']([^"']+)["']/;
const dynamicImportPattern =
  /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g;

export function runCheckFrontendFsd(
  options: CheckFrontendFsdOptions = {},
): number {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const argv = options.argv ?? [];

  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return 0;
  }

  if (argv.includes("--self-test")) {
    return runSelfTest();
  }

  const violations = checkWorkspace(workspaceRoot);
  if (violations.length > 0) {
    printViolations("Frontend FSD boundary check failed:", violations);
    return 1;
  }

  console.log(
    JSON.stringify({
      status: "ok",
      policy: "frontend-fsd-strict",
      layerOrder: fsdLayers,
      checkedFrontendFiles: collectFrontendSourceFiles(workspaceRoot).length,
    }),
  );
  return 0;
}

export function checkWorkspace(workspaceRoot: string): Violation[] {
  const projects = collectProjects(workspaceRoot);
  const tsconfigPaths = readTsconfigPaths(workspaceRoot);
  const sourceFiles = collectFrontendSourceFiles(workspaceRoot);
  const violations: Violation[] = [];

  violations.push(...checkProjectTags(workspaceRoot, projects));
  violations.push(...checkEslintBoundaryConfig(workspaceRoot));

  for (const sourceFile of sourceFiles) {
    const relativeSourceFile = toWorkspacePath(workspaceRoot, sourceFile);
    const sourceText = readFileSync(sourceFile, "utf8");
    const sourceInfo = classifyModule(sourceFile, workspaceRoot, projects);

    if (boundaryDisablePattern.test(sourceText)) {
      violations.push({
        file: relativeSourceFile,
        code: "fsd-boundary-rule-disabled",
        message:
          "Frontend files must not disable module/FSD boundary lint rules.",
      });
    }

    if (sourceInfo === undefined) continue;

    for (const importReference of collectImports(sourceText)) {
      const targetPath = resolveImportPath(
        importReference.specifier,
        sourceFile,
        workspaceRoot,
        tsconfigPaths,
      );
      if (targetPath === undefined) continue;
      const targetInfo = classifyModule(targetPath, workspaceRoot, projects);
      if (targetInfo === undefined) continue;
      violations.push(
        ...checkImportBoundary({
          source: sourceInfo,
          target: targetInfo,
          importReference,
          workspaceRoot,
        }),
      );
    }
  }

  return violations.sort((left, right) => {
    const byFile = left.file.localeCompare(right.file);
    if (byFile !== 0) return byFile;
    return (left.line ?? 0) - (right.line ?? 0);
  });
}

function checkImportBoundary(input: {
  source: ModuleInfo;
  target: ModuleInfo;
  importReference: ImportReference;
  workspaceRoot: string;
}): Violation[] {
  const { source, target, importReference, workspaceRoot } = input;
  const sourceFile = toWorkspacePath(workspaceRoot, source.path);
  const targetFile = toWorkspacePath(workspaceRoot, target.path);
  const context = `${importReference.specifier} -> ${targetFile}`;
  const violations: Violation[] = [];

  if (source.path === target.path || isSameFsdUnit(source, target)) {
    return violations;
  }

  if (isLayerPublicApi(source) && source.layer === target.layer) {
    return violations;
  }

  if (target.layer === "app") {
    if (source.layer === "app" && source.slice === target.slice) {
      return violations;
    }
    violations.push({
      file: sourceFile,
      line: importReference.line,
      code: "fsd-app-to-app-import",
      message: `App layer is private to its application; importing ${context} is forbidden.`,
    });
    return violations;
  }

  if (layerRank[target.layer] > layerRank[source.layer]) {
    violations.push({
      file: sourceFile,
      line: importReference.line,
      code: "fsd-higher-layer-import",
      message: `${source.layer} must not import higher layer ${target.layer}: ${context}. Allowed order is app -> pages -> widgets -> features -> entities -> shared.`,
    });
  }

  if (
    source.layer === target.layer &&
    source.layer !== "shared" &&
    source.slice !== target.slice
  ) {
    violations.push({
      file: sourceFile,
      line: importReference.line,
      code: "fsd-cross-slice-import",
      message: `${source.layer} slice ${source.slice} must not import sibling slice ${target.slice}: ${context}.`,
    });
  }

  if (requiresPublicApi(source, target) && !isPublicApi(target)) {
    violations.push({
      file: sourceFile,
      line: importReference.line,
      code: "fsd-public-api-bypass",
      message: `Cross-boundary imports must use the target slice/project public API (${toWorkspacePath(workspaceRoot, target.publicApi)}), not ${context}.`,
    });
  }

  return violations;
}

function requiresPublicApi(source: ModuleInfo, target: ModuleInfo): boolean {
  if (source.layer === "app" && target.layer === "app") return false;
  if (
    source.sourceRoot === target.sourceRoot &&
    source.slice === target.slice
  ) {
    return false;
  }
  if (source.layer === target.layer && source.layer !== "shared") return false;
  return layerRank[target.layer] <= layerRank[source.layer];
}

function isSameFsdUnit(source: ModuleInfo, target: ModuleInfo): boolean {
  return (
    source.sourceRoot === target.sourceRoot && source.slice === target.slice
  );
}

function isPublicApi(target: ModuleInfo): boolean {
  return normalizePath(target.path) === normalizePath(target.publicApi);
}

function isLayerPublicApi(module: ModuleInfo): boolean {
  return (
    isPublicApi(module) &&
    normalizePath(module.sourceRoot).endsWith(`/${module.layer}`)
  );
}

function classifyModule(
  absolutePath: string,
  workspaceRoot: string,
  projects: ProjectInfo[],
): ModuleInfo | undefined {
  const path = normalizePath(resolve(absolutePath));
  const relativePath = toWorkspacePath(workspaceRoot, path);
  if (!frontendRoots.some((root) => relativePath.startsWith(`${root}/`))) {
    return undefined;
  }

  const project = findOwningProject(path, projects);
  const directLayer = classifyByLayerDirectory(path, workspaceRoot, project);
  if (directLayer !== undefined) return directLayer;

  if (project?.fsdLayer !== undefined) {
    return {
      layer: project.fsdLayer,
      slice: project.slice,
      project,
      sourceRoot: project.sourceRoot,
      publicApi:
        findPublicApi(project.sourceRoot) ??
        join(project.sourceRoot, "index.ts"),
      path,
    };
  }
  return undefined;
}

function classifyByLayerDirectory(
  absolutePath: string,
  workspaceRoot: string,
  project?: ProjectInfo,
): ModuleInfo | undefined {
  const relativePath = toWorkspacePath(workspaceRoot, absolutePath);
  const segments = relativePath.split("/");
  const srcIndex = segments.indexOf("src");
  if (srcIndex < 0) return undefined;

  const layer = segments[srcIndex + 1] as FsdLayer | undefined;
  if (layer === undefined || !isFsdLayer(layer)) return undefined;

  const afterLayer = segments[srcIndex + 2] ?? "";
  if (isIndexSourceFile(afterLayer)) {
    const appName =
      project?.slice ??
      (segments[0] === "apps" && segments[1] === "frontend" && segments[2]
        ? segments[2]
        : "app");
    const sourceRoot = resolve(
      workspaceRoot,
      segments.slice(0, srcIndex + 2).join("/"),
    );
    return {
      layer,
      slice: layer === "app" ? appName : layer,
      sourceRoot,
      publicApi: absolutePath,
      path: absolutePath,
    };
  }

  if (layer === "app") {
    const appName =
      project?.slice ??
      (segments[0] === "apps" && segments[1] === "frontend" && segments[2]
        ? segments[2]
        : "app");
    const sourceRoot = resolve(
      workspaceRoot,
      segments.slice(0, srcIndex + 2).join("/"),
    );
    return {
      layer,
      slice: appName,
      sourceRoot,
      publicApi: join(sourceRoot, "index.ts"),
      path: absolutePath,
    };
  }

  const slice =
    layer === "shared"
      ? (segments[srcIndex + 2] ?? "shared")
      : segments[srcIndex + 2];
  if (slice.length === 0) return undefined;
  const sourceRoot = resolve(
    workspaceRoot,
    segments.slice(0, srcIndex + 3).join("/"),
  );
  return {
    layer,
    slice,
    sourceRoot,
    publicApi: findPublicApi(sourceRoot) ?? join(sourceRoot, "index.ts"),
    path: absolutePath,
  };
}

function collectProjects(workspaceRoot: string): ProjectInfo[] {
  const projectFiles = [
    ...walkFiles(resolve(workspaceRoot, "apps"), (path) =>
      path.endsWith("project.json"),
    ),
    ...walkFiles(resolve(workspaceRoot, "libs"), (path) =>
      path.endsWith("project.json"),
    ),
  ];
  return projectFiles.flatMap((projectFile) => {
    try {
      const project = JSON.parse(readFileSync(projectFile, "utf8")) as {
        name?: string;
        sourceRoot?: string;
        tags?: string[];
      };
      const projectRoot = dirname(projectFile);
      const sourceRoot = resolve(
        workspaceRoot,
        project.sourceRoot ?? join(relative(workspaceRoot, projectRoot), "src"),
      );
      const tags = project.tags ?? [];
      const fsdLayerTag = tags.find((tag) => tag.startsWith("fsd:layer:"));
      const fsdLayer = fsdLayerTag?.slice("fsd:layer:".length) as
        | FsdLayer
        | undefined;
      const relativeProjectRoot = toWorkspacePath(workspaceRoot, projectRoot);
      const projectName = project.name ?? relativeProjectRoot;
      const appSlice = relativeProjectRoot.startsWith("apps/frontend/")
        ? (relativeProjectRoot.split("/")[2] ?? projectName)
        : projectName;
      return [
        {
          name: projectName,
          slice: appSlice,
          projectRoot,
          sourceRoot,
          tags,
          fsdLayer:
            fsdLayer !== undefined && isFsdLayer(fsdLayer)
              ? fsdLayer
              : undefined,
        },
      ];
    } catch {
      return [];
    }
  });
}

function checkProjectTags(
  workspaceRoot: string,
  projects: ProjectInfo[],
): Violation[] {
  const violations: Violation[] = [];
  for (const project of projects) {
    const relativeProjectRoot = toWorkspacePath(
      workspaceRoot,
      project.projectRoot,
    );
    const isFrontendProject =
      project.tags.includes("platform:frontend") ||
      relativeProjectRoot.startsWith("apps/frontend/") ||
      relativeProjectRoot.startsWith("libs/frontend/");
    if (!isFrontendProject) continue;
    const expectedLayer = relativeProjectRoot.startsWith("apps/frontend/")
      ? "app"
      : "shared";
    if (!project.tags.includes(`fsd:layer:${expectedLayer}`)) {
      violations.push({
        file: `${relativeProjectRoot}/project.json`,
        code: "fsd-project-tag-missing",
        message: `Frontend project ${project.name} must carry fsd:layer:${expectedLayer} so Nx/project metadata cannot silently bypass FSD checks.`,
      });
    }
  }
  return violations;
}

function checkEslintBoundaryConfig(workspaceRoot: string): Violation[] {
  const eslintPath = resolve(workspaceRoot, "eslint.config.js");
  if (!existsSync(eslintPath)) return [];
  const text = readFileSync(eslintPath, "utf8");
  const violations: Violation[] = [];
  if (
    !text.includes('"@nx/enforce-module-boundaries"') &&
    !text.includes("'@nx/enforce-module-boundaries'")
  ) {
    violations.push({
      file: "eslint.config.js",
      code: "fsd-nx-boundary-rule-missing",
      message:
        "Root ESLint config must keep @nx/enforce-module-boundaries enabled.",
    });
  }
  if (/[@"']nx\/enforce-module-boundaries["']?\s*:\s*["']off["']/.test(text)) {
    violations.push({
      file: "eslint.config.js",
      code: "fsd-nx-boundary-rule-disabled",
      message:
        "Root ESLint config must not disable @nx/enforce-module-boundaries.",
    });
  }
  return violations;
}

function collectFrontendSourceFiles(workspaceRoot: string): string[] {
  return frontendRoots.flatMap((root) =>
    walkFiles(
      resolve(workspaceRoot, root),
      (path) =>
        frontendSourceExtensions.has(extname(path)) &&
        !path.includes(`${sep}node_modules${sep}`) &&
        !path.includes(`${sep}dist${sep}`),
    ),
  );
}

function collectImports(sourceText: string): ImportReference[] {
  const references: ImportReference[] = [];
  const lines = sourceText.split("\n");

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trimStart();
    const isStaticImport =
      trimmed.startsWith("import ") ||
      trimmed.startsWith("import{") ||
      trimmed.startsWith("import*") ||
      trimmed.startsWith('import"') ||
      trimmed.startsWith("import'");
    const isStaticExport =
      trimmed.startsWith("export ") && trimmed.includes(" from ");
    if (!isStaticImport && !isStaticExport) continue;

    const match = importSpecifierPattern.exec(line);
    const specifier = match?.[1] ?? "";
    if (specifier.length === 0) continue;
    references.push({ specifier, line: index + 1 });
  }

  dynamicImportPattern.lastIndex = 0;
  for (const match of sourceText.matchAll(dynamicImportPattern)) {
    const specifier = match[1] ?? "";
    if (specifier.length === 0) continue;
    references.push({
      specifier,
      line: 1 + sourceText.slice(0, match.index).split("\n").length - 1,
    });
  }

  return references;
}

function resolveImportPath(
  specifier: string,
  sourceFile: string,
  workspaceRoot: string,
  tsconfigPaths: Map<string, string>,
): string | undefined {
  if (specifier.startsWith("node:") || isExternalSpecifier(specifier))
    return undefined;
  if (specifier.startsWith("."))
    return resolveExistingPath(resolve(dirname(sourceFile), specifier));
  if (specifier.startsWith("apps/") || specifier.startsWith("libs/"))
    return resolveExistingPath(resolve(workspaceRoot, specifier));
  for (const [alias, target] of tsconfigPaths) {
    if (specifier === alias)
      return resolveExistingPath(resolve(workspaceRoot, target));
    if (specifier.startsWith(`${alias}/`)) {
      const absoluteTarget = resolve(workspaceRoot, target);
      const sourceRoot = /\/index\.[cm]?[jt]sx?$/.test(
        normalizePath(absoluteTarget),
      )
        ? dirname(absoluteTarget)
        : absoluteTarget;
      return resolveExistingPath(
        resolve(sourceRoot, specifier.slice(alias.length + 1)),
      );
    }
  }
  return undefined;
}

function readTsconfigPaths(workspaceRoot: string): Map<string, string> {
  const path = resolve(workspaceRoot, "tsconfig.base.json");
  if (!existsSync(path)) return new Map();
  const config = JSON.parse(readFileSync(path, "utf8")) as {
    compilerOptions?: { paths?: Record<string, string[]> };
  };
  return new Map(
    Object.entries(config.compilerOptions?.paths ?? {}).flatMap(
      ([alias, targets]) => {
        const target = targets[0] ?? "";
        return target.length === 0
          ? []
          : [[alias.replace(/\/\*$/, ""), target.replace(/\/\*$/, "")]];
      },
    ),
  );
}

function resolveExistingPath(candidate: string): string | undefined {
  const normalized = normalizePath(candidate);
  const withoutTrailingIndex = normalized.replace(/\/index$/, "");
  const candidates = [
    normalized,
    ...sourceExtensions.map((extension) => `${normalized}${extension}`),
    ...sourceExtensions.map((extension) =>
      join(normalized, `index${extension}`),
    ),
    ...sourceExtensions.map((extension) =>
      join(withoutTrailingIndex, `index${extension}`),
    ),
  ];
  return candidates.find((path) => existsSync(path) && statSync(path).isFile());
}

function findPublicApi(sourceRoot: string): string | undefined {
  return sourceExtensions
    .map((extension) => join(sourceRoot, `index${extension}`))
    .find((path) => existsSync(path) && statSync(path).isFile());
}

function isExternalSpecifier(specifier: string): boolean {
  return (
    !specifier.startsWith(".") &&
    !specifier.startsWith("@") &&
    !specifier.startsWith("apps/") &&
    !specifier.startsWith("libs/")
  );
}

function findOwningProject(
  path: string,
  projects: ProjectInfo[],
): ProjectInfo | undefined {
  return projects
    .filter((project) =>
      normalizePath(path).startsWith(`${normalizePath(project.sourceRoot)}/`),
    )
    .sort((left, right) => right.sourceRoot.length - left.sourceRoot.length)[0];
}

function isFsdLayer(value: string): value is FsdLayer {
  return (fsdLayers as readonly string[]).includes(value);
}

function isIndexSourceFile(path: string): boolean {
  return sourceExtensions.includes(extname(path)) && path.startsWith("index.");
}

function walkFiles(
  root: string,
  predicate: (path: string) => boolean,
): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      if (
        ["node_modules", "dist", ".nx", "coverage", "test-results"].includes(
          entry,
        )
      )
        continue;
      files.push(...walkFiles(path, predicate));
      continue;
    }
    if (stat.isFile() && predicate(path)) files.push(path);
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function runSelfTest(): number {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "frontend-fsd-check-"));
  try {
    writeFixture(
      workspaceRoot,
      "tsconfig.base.json",
      JSON.stringify(
        {
          compilerOptions: {
            paths: {
              "@fixture/shared": ["libs/frontend/shared/lib/src/index.ts"],
              "@fixture/shared/*": ["libs/frontend/shared/lib/src/*"],
              "@fixture/feature-a": [
                "apps/frontend/web/src/features/a/index.ts",
              ],
            },
          },
        },
        null,
        2,
      ),
    );
    writeFixture(
      workspaceRoot,
      "eslint.config.js",
      'module.exports = [{ rules: { "@nx/enforce-module-boundaries": "error" } }];\n',
    );
    writeFixture(
      workspaceRoot,
      "apps/frontend/web/project.json",
      JSON.stringify(
        {
          name: "web",
          sourceRoot: "apps/frontend/web/src",
          tags: ["platform:frontend", "type:frontend-app", "fsd:layer:app"],
        },
        null,
        2,
      ),
    );
    writeFixture(
      workspaceRoot,
      "libs/frontend/shared/lib/project.json",
      JSON.stringify(
        {
          name: "@fixture/shared",
          sourceRoot: "libs/frontend/shared/lib/src",
          tags: [
            "platform:frontend",
            "type:ui",
            "scope:shared",
            "fsd:layer:shared",
          ],
        },
        null,
        2,
      ),
    );
    writeFixture(
      workspaceRoot,
      "libs/frontend/shared/lib/src/index.ts",
      "export const publicValue = true;\n",
    );
    writeFixture(
      workspaceRoot,
      "libs/frontend/shared/lib/src/internal.ts",
      "export const privateValue = true;\n",
    );
    writeFixture(
      workspaceRoot,
      "apps/frontend/web/src/features/a/index.ts",
      "export const a = true;\n",
    );
    writeFixture(
      workspaceRoot,
      "apps/frontend/web/src/features/a/model.ts",
      "import { publicValue } from '@fixture/shared';\nexport const ok = publicValue;\n",
    );
    writeFixture(
      workspaceRoot,
      "apps/frontend/web/src/features/a/api.ts",
      "import { ok } from './model';\nexport const sameSliceInternal = ok;\n",
    );
    writeFixture(
      workspaceRoot,
      "apps/frontend/web/src/app/index.ts",
      "export { App } from './app';\n",
    );
    writeFixture(
      workspaceRoot,
      "apps/frontend/web/src/main.tsx",
      "import { App } from './app';\nexport const boot = App;\n",
    );
    writeFixture(
      workspaceRoot,
      "apps/frontend/web/src/pages/index.ts",
      "export { HomePage } from './home';\nexport { SettingsPage } from './settings';\n",
    );
    writeFixture(
      workspaceRoot,
      "apps/frontend/web/src/pages/settings/index.ts",
      "export const SettingsPage = true;\n",
    );
    writeFixture(
      workspaceRoot,
      "apps/frontend/web/src/features/b/model.ts",
      "import { a } from '../a';\nimport { privateValue } from '@fixture/shared/internal';\nexport const broken = [a, privateValue];\n",
    );
    writeFixture(
      workspaceRoot,
      "apps/frontend/web/src/shared/lib/index.ts",
      "export { App } from '../../app/app';\nexport { Page } from '../../pages/home';\n",
    );
    writeFixture(
      workspaceRoot,
      "apps/frontend/web/src/pages/home/index.ts",
      "export const Page = true;\n",
    );
    writeFixture(
      workspaceRoot,
      "apps/frontend/web/src/app/app.ts",
      "import { OtherApp } from '../../../../../other/src/app/app';\nexport const App = OtherApp;\n",
    );
    writeFixture(
      workspaceRoot,
      "apps/frontend/other/src/app/app.ts",
      "export const OtherApp = true;\n",
    );
    const violations = checkWorkspace(workspaceRoot);
    const unexpectedAllowedFixtureViolations = violations.filter((violation) =>
      [
        "apps/frontend/web/src/features/a/api.ts",
        "apps/frontend/web/src/app/index.ts",
        "apps/frontend/web/src/main.tsx",
        "apps/frontend/web/src/pages/index.ts",
      ].includes(violation.file),
    );
    if (unexpectedAllowedFixtureViolations.length > 0) {
      printViolations(
        "Frontend FSD self-test failed; accepted public API/same-slice fixtures were rejected:",
        unexpectedAllowedFixtureViolations,
      );
      return 1;
    }
    const codes = new Set(violations.map((violation) => violation.code));
    const expectedCodes = [
      "fsd-cross-slice-import",
      "fsd-public-api-bypass",
      "fsd-higher-layer-import",
      "fsd-app-to-app-import",
    ];
    const missing = expectedCodes.filter((code) => !codes.has(code));
    if (missing.length > 0) {
      printViolations(
        "Frontend FSD self-test failed; expected violation codes were not produced:",
        violations,
      );
      console.error(`Missing codes: ${missing.join(", ")}`);
      return 1;
    }
    console.log(
      JSON.stringify({
        status: "ok",
        selfTest: "frontend-fsd-check",
        expectedViolationCodes: expectedCodes,
        observedViolations: violations.length,
      }),
    );
    return 0;
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
}

function writeFixture(root: string, path: string, contents: string): void {
  const absolutePath = join(root, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
}

function printViolations(title: string, violations: Violation[]): void {
  console.error(title);
  for (const violation of violations) {
    const location =
      violation.line === undefined
        ? violation.file
        : `${violation.file}:${violation.line}`;
    console.error(`- [${violation.code}] ${location}: ${violation.message}`);
  }
}

function printHelp(): void {
  console.log("Usage: repo-tooling frontend fsd check [--self-test]");
  console.log("");
  console.log("Enforces strict frontend Feature-Sliced Design boundaries.");
  console.log(
    "Layer order: app -> pages -> widgets -> features -> entities -> shared.",
  );
}

function toWorkspacePath(workspaceRoot: string, path: string): string {
  return relative(workspaceRoot, path).split(sep).join("/");
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}
