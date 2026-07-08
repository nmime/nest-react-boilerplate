import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  type Dirent,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const workspaceRoot = resolve(process.cwd(), "../../../..");
const sourceRoots = ["apps/frontend", "libs/frontend"].map((root) =>
  join(workspaceRoot, root),
);
const codeFilePattern = /\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/;
const directShadcnRuntimeImportPattern =
  /(?:from|import)\s+["'](?:@radix-ui\/[^"']+|class-variance-authority|clsx|tailwind-merge)["']/;

const toWorkspacePath = (path: string): string =>
  relative(workspaceRoot, path).split(sep).join("/");

const readDirSafe = (directory: string): Dirent[] =>
  existsSync(directory) ? readdirSync(directory, { withFileTypes: true }) : [];

const walk = (directory: string): string[] => {
  const entries = readDirSafe(directory);
  const paths: string[] = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) {
        continue;
      }

      paths.push(entryPath, ...walk(entryPath));
      continue;
    }

    if (entry.isFile()) {
      paths.push(entryPath);
    }
  }

  return paths;
};

const sourcePaths = sourceRoots.flatMap(walk);
const sourceFiles = sourcePaths.filter((path) => {
  if (!codeFilePattern.test(path)) {
    return false;
  }

  if (path.includes(".spec.") || path.includes(".test.")) {
    return false;
  }

  return statSync(path).isFile();
});

const readSource = (path: string): string => readFileSync(path, "utf8");

describe("shadcn/ui monorepo boundary", () => {
  it("keeps shadcn component source centralized in @app/frontend-ui-web", () => {
    const duplicateUiDirectories = sourcePaths
      .filter((path) => statSync(path).isDirectory())
      .map(toWorkspacePath)
      .filter(
        (path) =>
          path !== "libs/frontend/ui-web/lib/src/component" &&
          (path.endsWith("/components/ui") ||
            path.endsWith("/src/components/ui")),
      );

    expect(duplicateUiDirectories).toEqual([]);
  });

  it("keeps Radix and shadcn helper dependencies behind the shared web UI facade", () => {
    const directRuntimeImports = sourceFiles
      .filter(
        (path) => !toWorkspacePath(path).startsWith("libs/frontend/ui-web/"),
      )
      .filter((path) => directShadcnRuntimeImportPattern.test(readSource(path)))
      .map(toWorkspacePath);

    expect(directRuntimeImports).toEqual([]);
  });

  it("keeps web shadcn UI and native Tamagui UI on separate renderer boundaries", () => {
    const webUiInNative = sourceFiles
      .filter((path) => {
        const workspacePath = toWorkspacePath(path);
        return (
          workspacePath.startsWith("apps/frontend/mobile/") ||
          workspacePath.startsWith("libs/frontend/ui-native/")
        );
      })
      .filter((path) => readSource(path).includes("@app/frontend-ui-web"))
      .map(toWorkspacePath);

    const nativeUiInWeb = sourceFiles
      .filter((path) => {
        const workspacePath = toWorkspacePath(path);
        return (
          workspacePath.startsWith("apps/frontend/admin/") ||
          workspacePath.startsWith("apps/frontend/app/") ||
          workspacePath.startsWith("apps/frontend/landing/") ||
          workspacePath.startsWith("apps/frontend/site/") ||
          workspacePath.startsWith("libs/frontend/ui-web/")
        );
      })
      .filter(
        (path) =>
          readSource(path).includes("@app/frontend-ui-native") ||
          readSource(path).includes('from "tamagui"'),
      )
      .map(toWorkspacePath);

    expect(webUiInNative).toEqual([]);
    expect(nativeUiInWeb).toEqual([]);
  });

  it("keeps the shadcn icon library backed by its runtime dependency", () => {
    const componentsJson = JSON.parse(
      readFileSync(join(workspaceRoot, "components.json"), "utf8"),
    ) as { iconLibrary?: string };
    const frontendPackageJson = JSON.parse(
      readFileSync(join(workspaceRoot, "libs/frontend/package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };

    expect(componentsJson.iconLibrary).toBe("lucide");
    expect(frontendPackageJson.dependencies).toHaveProperty("lucide-react");
  });
});
