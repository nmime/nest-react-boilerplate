import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const workspaceRoot = join(__dirname, "../../../../../../../");
const discordRoots = [
  "libs/backend/bots/discord/lib",
  "apps/backend/discord-app-api",
];
const forbiddenModules = [
  ["@sapphire", "framework"].join("/"),
  ["discord", "x"].join(""),
  ["detri", "tus"].join(""),
  ["@discord", "js", "builders"].join(""),
  ["@discord", "js", "rest"].join(""),
  ["discord", "js"].join("."),
];

describe("Discord static policy", () => {
  it("does not reintroduce forbidden Discord SDK dependencies", () => {
    const packageJson = JSON.parse(
      readFileSync(join(workspaceRoot, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    for (const moduleName of forbiddenModules) {
      expect(declared).not.toHaveProperty(moduleName);
    }
  });

  it("does not import forbidden SDKs, Telegram bot code, or credential literals", () => {
    const failures: string[] = [];

    for (const file of sourceFiles()) {
      const content = readFileSync(join(workspaceRoot, file), "utf8");
      for (const moduleName of forbiddenModules) {
        const escaped = moduleName
          .replaceAll("/", "\\/")
          .replaceAll(".", "\\.");
        const importPattern = new RegExp(
          `(?:from\\s+["']${escaped}["']|import\\(["']${escaped}["']\\)|require\\(["']${escaped}["']\\))`,
          "u",
        );
        if (importPattern.test(content))
          failures.push(`${file}: forbidden import ${moduleName}`);
      }
      if (/from\s+["'][^"']*(?:telegram|grammy)[^"']*["']/iu.test(content))
        failures.push(`${file}: forbidden Telegram import`);
      if (/Bot\s+[A-Za-z0-9._=-]{24,}/u.test(content))
        failures.push(`${file}: bot credential literal`);
      const selfTestFile = file.endsWith("discord-static-policy.spec.ts");
      if (
        !selfTestFile &&
        /(?:client_secret|client-secret|clientSecret).{0,8}\S{16,}/iu.test(
          content,
        )
      )
        failures.push(`${file}: client credential literal`);
      if (/discord\s+admin/iu.test(content))
        failures.push(`${file}: stale admin name`);
    }

    expect(failures).toEqual([]);
  });

  it("does not render raw template delimiters or placeholder API bases", () => {
    const failures: string[] = [];

    for (const file of sourceFiles()) {
      const selfTestFile = file.endsWith("discord-static-policy.spec.ts");
      const content = readFileSync(join(workspaceRoot, file), "utf8");
      if (!selfTestFile && (/\{\{/u.test(content) || /\}\}/u.test(content))) {
        failures.push(`${file}: raw template delimiter`);
      }
      if (!selfTestFile && /api[-_ ]?root/iu.test(content)) {
        failures.push(`${file}: placeholder API base`);
      }
    }

    expect(failures).toEqual([]);
  });
});

function sourceFiles() {
  return discordRoots.flatMap((root) => walk(join(workspaceRoot, root)));
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    if (!entry.isFile() || !/\.[cm]?tsx?$/u.test(entry.name)) return [];
    return [relative(workspaceRoot, path)];
  });
}
