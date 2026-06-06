import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { run } from "../../runtime/process";

export interface StaticCheckOptions {
  workspaceRoot?: string;
}

interface CheckFailure {
  command: string;
  file?: string;
  status: number;
  stdout: string;
  stderr: string;
  error?: string;
}

interface ReferencedScript {
  owner: string;
  script: string;
  reference: string;
  path: string;
}

const nodeScriptReference = /(?:^|&&|\|\||;|\s)node\s+([^\s]+\.(?:cjs|js|mjs|mts|ts))/g;
const shellScriptReference = /(?:^|&&|\|\||;|\s)(?:bash|sh)\s+([^\s]+\.sh)/g;
const pnpmRunReference = /(?:^|&&|\|\||;|\s)pnpm\s+run\s+([@\w:.-]+)/g;

export function runStaticCheck(options: StaticCheckOptions = {}): number {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const syntaxTargets = collectToolingModuleScripts(workspaceRoot);
  const failures: CheckFailure[] = [];

  for (const script of syntaxTargets) {
    const result = run(process.execPath, ["--check", script], {
      cwd: workspaceRoot,
    });

    if (result.status !== 0) {
      failures.push({ ...result, file: relativeToWorkspace(workspaceRoot, script) });
    }
  }

  const smokeCommands = [
    ["packages/tooling/bin/repo-tooling.mjs", "--help"],
    ["packages/tooling/bin/repo-tooling.mjs", "project", "check-library-configs", "--help"],
    ["packages/tooling/bin/repo-tooling.mjs", "tooling", "static-check", "--help"],
    ["packages/tooling/bin/repo-tooling.mjs", "db", "migrations", "rollback-check", "--help"],
  ];

  for (const args of smokeCommands) {
    const result = run(process.execPath, args, { cwd: workspaceRoot });

    if (result.status !== 0) {
      failures.push(result);
    }
  }

  const referenceFailures = checkPackageScriptReferences(workspaceRoot);

  for (const failure of referenceFailures) {
    failures.push({
      command: `package.json script reference ${failure.owner}#${failure.script}`,
      file: failure.owner,
      status: 1,
      stdout: "",
      stderr: `Missing referenced script path: ${failure.reference} -> ${failure.path}`,
    });
  }

  if (failures.length > 0) {
    console.error("Tooling static validation failed:");

    for (const failure of failures) {
      console.error(`- command: ${failure.command}`);
      if (failure.file) console.error(`  file: ${failure.file}`);
      console.error(`  exitCode: ${failure.status}`);
      if (failure.stderr) console.error(`  stderr: ${tail(failure.stderr)}`);
      if (failure.stdout) console.error(`  stdout: ${tail(failure.stdout)}`);
      if (failure.error) console.error(`  error: ${failure.error}`);
    }

    return 1;
  }

  console.log(
    JSON.stringify({
      status: "ok",
      checkedSyntax: syntaxTargets.length,
      importSmoke: smokeCommands.length,
      packageScriptReferences: countPackageScriptReferences(workspaceRoot),
    }),
  );

  return 0;
}

function collectToolingModuleScripts(workspaceRoot: string): string[] {
  return [
    ...walk(resolve(workspaceRoot, "packages/tooling/bin")),
    ...walk(resolve(workspaceRoot, "packages/tooling/scripts")),
  ]
    .filter((path) => path.endsWith(".mjs"))
    .sort();
}

function walk(root: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      files.push(...walk(path));
    } else if (stat.isFile()) {
      files.push(path);
    }
  }

  return files;
}

function checkPackageScriptReferences(workspaceRoot: string): ReferencedScript[] {
  const packageJsonPaths = ["package.json", "packages/tooling/package.json"];
  const missing: ReferencedScript[] = [];

  for (const owner of packageJsonPaths) {
    const packageJson = JSON.parse(
      readFileSync(resolve(workspaceRoot, owner), "utf8"),
    ) as { scripts?: Record<string, string> };
    const scripts = packageJson.scripts ?? {};

    for (const [script, command] of Object.entries(scripts)) {
      const references = [
        ...extractPathReferences(command, nodeScriptReference),
        ...extractPathReferences(command, shellScriptReference),
      ];

      for (const reference of references) {
        const path = normalizeReference(reference);
        const absolutePath = resolve(workspaceRoot, owner, "..", path);
        if (!statExists(absolutePath)) {
          missing.push({
            owner,
            script,
            reference,
            path: relativeToWorkspace(workspaceRoot, absolutePath),
          });
        }
      }

      for (const referencedScript of extractScriptReferences(command)) {
        if (!Object.hasOwn(scripts, referencedScript)) {
          missing.push({
            owner,
            script,
            reference: `pnpm run ${referencedScript}`,
            path: `${owner}#scripts.${referencedScript}`,
          });
        }
      }
    }
  }

  return missing;
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
  return reference.replace(/^['\"]|['\"]$/g, "");
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

function tail(value: string, max = 2000): string {
  return value.length > max ? value.slice(-max) : value;
}
