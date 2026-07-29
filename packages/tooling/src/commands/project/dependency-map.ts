import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

type DependencySection = "dependencies" | "devDependencies";

interface PackageManifest {
  name?: unknown;
  dependencies?: unknown;
  devDependencies?: unknown;
}

export interface WorkspacePackageMapEntry {
  name: string;
  path: string;
  scope: string;
  productionDependencies: string[];
  developmentDependencies: string[];
}

export interface DependencyScopeMapEntry {
  scope: string;
  workspaceCount: number;
  productionDependencies: string[];
  developmentDependencies: string[];
}

export interface LibraryDependencyOwner {
  source: string;
  manifest: string;
  workspace: string;
  responsibility: string;
}

export interface WorkspaceDependencyMap {
  workspaceCount: number;
  workspaces: WorkspacePackageMapEntry[];
  scopes: DependencyScopeMapEntry[];
  libraryOwnership: LibraryDependencyOwner[];
}

export interface DependencyMapOptions {
  argv?: string[];
  workspaceRoot?: string;
}

const libraryOwnership: LibraryDependencyOwner[] = [
  {
    source: "apps/backend/**",
    manifest: "libs/backend/package.json",
    workspace: "@app/backend",
    responsibility: "External dependencies used by backend applications and libraries.",
  },
  {
    source: "apps/frontend/**",
    manifest: "libs/frontend/package.json",
    workspace: "@app/frontend",
    responsibility: "External dependencies used by frontend applications and libraries.",
  },
  {
    source: "libs/backend/**",
    manifest: "libs/backend/package.json",
    workspace: "@app/backend",
    responsibility: "External dependencies used by backend applications and libraries.",
  },
  {
    source: "libs/frontend/**",
    manifest: "libs/frontend/package.json",
    workspace: "@app/frontend",
    responsibility: "External dependencies used by frontend applications and libraries.",
  },
  {
    source: "libs/common/**",
    manifest: "package.json",
    workspace: "nest-react-boilerplate",
    responsibility: "Cross-runtime libraries use the root manifest; they are not a separate pnpm workspace.",
  },
];

export function buildWorkspaceDependencyMap(workspaceRoot: string): WorkspaceDependencyMap {
  const workspaceFile = join(workspaceRoot, "pnpm-workspace.yaml");
  if (!existsSync(workspaceFile)) {
    throw new Error(`pnpm-workspace.yaml not found under ${workspaceRoot}`);
  }

  const patterns = parseWorkspacePatterns(readFileSync(workspaceFile, "utf8"));
  if (patterns.length === 0) {
    throw new Error("pnpm-workspace.yaml must declare at least one packages pattern");
  }

  const manifestPaths = [join(workspaceRoot, "package.json")];
  for (const sourceRoot of ["apps", "libs", "packages"]) {
    const absoluteRoot = join(workspaceRoot, sourceRoot);
    if (existsSync(absoluteRoot)) manifestPaths.push(...findPackageManifests(absoluteRoot));
  }

  const workspaces = manifestPaths
    .map((absolutePath) => normalizeWorkspacePath(relative(workspaceRoot, absolutePath)))
    .filter(
      (manifestPath) =>
        manifestPath === "package.json" ||
        patterns.some((pattern) => matchesWorkspacePattern(dirname(manifestPath), pattern)),
    )
    .sort()
    .map((manifestPath) => readWorkspaceManifest(workspaceRoot, manifestPath));

  const scopes = [...new Set(workspaces.map(({ scope }) => scope))]
    .sort()
    .map((scope) => {
      const entries = workspaces.filter((workspace) => workspace.scope === scope);
      return {
        scope,
        workspaceCount: entries.length,
        productionDependencies: uniqueSorted(entries.flatMap(({ productionDependencies }) => productionDependencies)),
        developmentDependencies: uniqueSorted(entries.flatMap(({ developmentDependencies }) => developmentDependencies)),
      };
    });

  return {
    workspaceCount: workspaces.length,
    workspaces,
    scopes,
    libraryOwnership,
  };
}

export function formatWorkspaceDependencyMap(map: WorkspaceDependencyMap): string {
  const lines = [
    `# Workspace dependency map (${map.workspaceCount} workspaces)`,
    "",
    "## Scope summary",
    "",
    "| Scope | Workspaces | Unique production | Unique development |",
    "| --- | ---: | ---: | ---: |",
    ...map.scopes.map(
      (scope) =>
        `| ${scope.scope} | ${scope.workspaceCount} | ${scope.productionDependencies.length} | ${scope.developmentDependencies.length} |`,
    ),
    "",
    "## Workspace manifests",
    "",
    "| Scope | Workspace | Production | Development | Manifest |",
    "| --- | --- | ---: | ---: | --- |",
    ...map.workspaces.map(
      (workspace) =>
        `| ${workspace.scope} | ${workspace.name} | ${workspace.productionDependencies.length} | ${workspace.developmentDependencies.length} | ${workspace.path} |`,
    ),
    "",
    "## Source dependency ownership",
    "",
    "| Source scope | Owning manifest | Workspace | Responsibility |",
    "| --- | --- | --- | --- |",
    ...map.libraryOwnership.map(
      (owner) => `| ${owner.source} | ${owner.manifest} | ${owner.workspace} | ${owner.responsibility} |`,
    ),
    "",
  ];
  return lines.join("\n");
}

export function runDependencyMap(options: DependencyMapOptions = {}): number {
  const argv = options.argv ?? [];
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write("Usage: pnpm run deps:map [-- --json]\n");
    return 0;
  }

  const unsupported = argv.filter((argument) => argument !== "--json");
  if (unsupported.length > 0) {
    process.stderr.write(`Unsupported dependency-map argument: ${unsupported[0]}\n`);
    return 1;
  }

  try {
    const map = buildWorkspaceDependencyMap(options.workspaceRoot ?? process.cwd());
    process.stdout.write(argv.includes("--json") ? `${JSON.stringify(map, null, 2)}\n` : formatWorkspaceDependencyMap(map));
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

export function normalizeWorkspacePath(value: string): string {
  return value.split(sep).join("/").replaceAll("\\", "/");
}

function parseWorkspacePatterns(contents: string): string[] {
  const patterns: string[] = [];
  let readingPackages = false;
  for (const line of contents.split(/\r?\n/u)) {
    if (/^packages:\s*$/u.test(line)) {
      readingPackages = true;
      continue;
    }
    if (!readingPackages) continue;
    const match = /^\s+-\s+['"]([^'"]+)['"]\s*$/u.exec(line);
    if (match?.[1] !== undefined) {
      patterns.push(match[1]);
      continue;
    }
    if (/^[^\s#]/u.test(line)) break;
  }
  return patterns;
}

function findPackageManifests(directory: string): string[] {
  const manifests: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".nx") continue;
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) manifests.push(...findPackageManifests(absolutePath));
    else if (entry.isFile() && entry.name === "package.json") manifests.push(absolutePath);
  }
  return manifests;
}

function matchesWorkspacePattern(workspacePath: string, pattern: string): boolean {
  const pathSegments = normalizeWorkspacePath(workspacePath).split("/");
  const patternSegments = pattern.split("/");
  if (pathSegments.length !== patternSegments.length) return false;
  return patternSegments.every((segment, index) => segment === "*" || segment === pathSegments[index]);
}

function readWorkspaceManifest(workspaceRoot: string, manifestPath: string): WorkspacePackageMapEntry {
  const manifest = JSON.parse(readFileSync(join(workspaceRoot, manifestPath), "utf8")) as PackageManifest;
  const name =
    typeof manifest.name === "string" && manifest.name.length > 0
      ? manifest.name
      : manifestPath.startsWith("apps/")
        ? `${dirname(manifestPath)} dependency boundary`
        : undefined;
  if (!name) {
    throw new Error(`${manifestPath}: package manifest must declare a non-empty name`);
  }
  return {
    name,
    path: manifestPath,
    scope: classifyScope(manifestPath),
    productionDependencies: readDependencySection(manifest, "dependencies", manifestPath),
    developmentDependencies: readDependencySection(manifest, "devDependencies", manifestPath),
  };
}

function readDependencySection(
  manifest: PackageManifest,
  section: DependencySection,
  manifestPath: string,
): string[] {
  const value = manifest[section];
  if (value === undefined) return [];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${manifestPath}: ${section} must be an object`);
  }
  return Object.keys(value).sort();
}

function classifyScope(manifestPath: string): string {
  if (manifestPath === "package.json") return "root";
  for (const scope of ["apps/backend", "apps/frontend", "libs/backend", "libs/frontend", "packages/tooling"]) {
    if (manifestPath.startsWith(`${scope}/`)) return scope;
  }
  return "other";
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}
