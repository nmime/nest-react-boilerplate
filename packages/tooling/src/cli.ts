import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { runCheckFrontendFsd } from "./commands/frontend/check-fsd";
import { fileURLToPath } from "node:url";
import { runCheckLibraryConfigs } from "./commands/project/check-library-configs";
import { runGenerateVerticalSliceFromContext } from "./commands/project/generate-vertical-slice";
import { runMutation } from "./commands/qa/mutation";
import { runBranchCleanup } from "./commands/git/branch-cleanup";
import {
  runChangedFormatCheck,
  runStaticCheck,
} from "./commands/tooling/static-check";
import { run } from "./runtime/process";

export interface CommandContext {
  argv: string[];
  packageRoot: string;
  workspaceRoot: string;
}

type CommandHandler = (context: CommandContext) => number | Promise<number>;

interface CommandDefinition {
  description: string;
  handler: CommandHandler;
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageRoot, "../..");

const commands = new Map<string, CommandDefinition>();

register(
  "git:branch-cleanup",
  "Safely preview or delete local/remote branches already merged into the target branch.",
  runBranchCleanup,
);

register(
  "frontend:fsd:check",
  "Enforce strict frontend Feature-Sliced Design boundaries.",
  ({ argv, workspaceRoot }) => runCheckFrontendFsd({ argv, workspaceRoot }),
);

register(
  "project:check-library-configs",
  "Validate Nx library config placement.",
  ({ workspaceRoot }) => runCheckLibraryConfigs({ workspaceRoot }),
);
register(
  "project:generate-vertical-slice",
  "Scaffold a checklist-driven product vertical slice.",
  runGenerateVerticalSliceFromContext,
);
register(
  "qa:mutation",
  "Run Stryker mutation testing or write its dry-run report.",
  ({ argv, workspaceRoot }) => runMutation({ argv, workspaceRoot }),
);
register(
  "tooling:static-check",
  "Run TS-first static validation and safe import smoke checks for repo tooling commands.",
  ({ workspaceRoot }) => runStaticCheck({ workspaceRoot }),
);
register(
  "tooling:changed-format-check",
  "Run Prettier only on changed files for PR memory-safe formatting validation.",
  ({ argv, workspaceRoot }) => runChangedFormatCheck({ argv, workspaceRoot }),
);

registerScript(
  "testing:storybook",
  "Run Storybook interaction tests.",
  "testing/storybook-test.ts",
);
registerScript(
  "testing:storybook-visual",
  "Run Storybook visual regression tests.",
  "testing/storybook-visual-regression.ts",
);
registerScript(
  "testing:frontend-static-smoke",
  "Smoke-test a built frontend app from static assets.",
  "testing/frontend-static-smoke.ts",
);
registerScript(
  "testing:frontend-browser-e2e-coverage",
  "Run browser e2e smoke coverage against a built frontend app.",
  "testing/frontend-browser-e2e-coverage.ts",
);
registerScript("db:migrate", "Run database migrations.", "db/migrate.ts");
registerScript(
  "db:migrations:check",
  "Check database migration naming and drift.",
  "db/migrations-check.ts",
);
registerScript(
  "db:migrations:rollback-check",
  "Run auth migrations up/down/up against disposable PostgreSQL.",
  "db/migrations-rollback-check.ts",
);
registerScript("db:reset", "Reset the local database.", "db/reset.ts");
registerScript("db:seed", "Seed the local database.", "db/seed.ts");
registerScript("db:backup", "Create a PostgreSQL backup.", "db/backup.ts");
registerScript("db:restore", "Restore a PostgreSQL backup.", "db/restore.ts");
registerScript(
  "db:restore-drill",
  "Run a PostgreSQL backup/restore drill or CI-safe dry-run.",
  "db/restore-drill.ts",
);
registerScript(
  "dev:fullstack",
  "Run the local fullstack dev helper.",
  "dev/fullstack.ts",
);
registerScript("docker:smoke", "Run Docker smoke checks.", "docker/smoke.ts");
registerScript(
  "docker:fullstack-e2e",
  "Run Docker fullstack e2e checks.",
  "docker/fullstack-e2e.ts",
);
registerScript(
  "project:init",
  "Initialize project placeholders.",
  "project/init-project.ts",
);
registerScript(
  "api:openapi",
  "Export OpenAPI contracts.",
  "api/export-openapi.ts",
);
registerScript(
  "api:client",
  "Generate one API client.",
  "api/generate-client.ts",
);
registerScript(
  "api:clients",
  "Generate API clients.",
  "api/generate-clients.ts",
);
registerScript(
  "api:clients:check",
  "Check generated API clients.",
  "api/check-clients.ts",
);
registerScript(
  "api:contracts",
  "Generate API contracts.",
  "api/generate-contracts.ts",
);
registerScript(
  "api:contracts:check",
  "Check generated API contracts.",
  "api/check-contracts.ts",
);
registerScript(
  "qa:consumer-contracts",
  "Validate consumer contracts.",
  "qa/consumer-contracts.ts",
);
registerScript(
  "qa:openapi-lint",
  "Lint OpenAPI contracts.",
  "qa/openapi-lint.ts",
);
registerScript(
  "qa:openapi-fuzz",
  "Generate OpenAPI fuzz cases.",
  "qa/openapi-fuzz.ts",
);
registerScript(
  "qa:accessibility",
  "Run accessibility checks.",
  "qa/accessibility.ts",
);
registerScript(
  "qa:cross-browser-e2e",
  "Run cross-browser e2e matrix.",
  "qa/cross-browser-e2e.ts",
);
registerScript(
  "qa:performance",
  "Run performance checks.",
  "qa/performance.ts",
);
registerScript("qa:security-sast", "Run SAST checks.", "qa/security-sast.ts");
registerScript(
  "qa:secret-scan",
  "Run secret scanning checks.",
  "qa/secret-scan.ts",
);
registerScript("qa:security-dast", "Run DAST checks.", "qa/security-dast.ts");
registerScript(
  "qa:security-suite",
  "Run the security suite.",
  "qa/security-suite.ts",
);
registerScript("qa:property", "Run property-based checks.", "qa/property.ts");
registerScript(
  "qa:world-class-gates",
  "Run world-class quality gates.",
  "qa/world-class-gates.ts",
);

export async function main(
  argv: string[] = process.argv.slice(2),
): Promise<number> {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    printHelp();
    return 0;
  }

  const resolved = resolveCommand(argv);

  if (resolved === undefined) {
    console.error(`Unknown tooling command: ${argv[0] ?? ""}`);
    printHelp();
    return 1;
  }

  if (resolved.argv[0] === "--help" || resolved.argv[0] === "-h") {
    printCommandHelp(resolved.name, resolved.command);
    return 0;
  }

  const commandArgv =
    resolved.argv[0] === "--" ? resolved.argv.slice(1) : resolved.argv;

  return await resolved.command.handler({
    argv: commandArgv,
    packageRoot,
    workspaceRoot,
  });
}

function register(
  name: string,
  description: string,
  handler: CommandHandler,
): void {
  commands.set(name, { description, handler });
}

function registerScript(
  name: string,
  description: string,
  commandPath: string,
): void {
  register(name, description, ({ argv, packageRoot, workspaceRoot }) => {
    const commandModule = resolve(packageRoot, "src/commands", commandPath);

    if (!existsSync(commandModule)) {
      console.error(`Tooling command module not found: ${commandModule}`);
      return 1;
    }

    const result = run(
      process.execPath,
      [resolve(packageRoot, "bin/run-ts-command.mjs"), commandModule, ...argv],
      {
        cwd: workspaceRoot,
        stdio: "inherit",
      },
    );

    return result.status;
  });
}

function resolveCommand(
  argv: string[],
): { name: string; command: CommandDefinition; argv: string[] } | undefined {
  for (
    let tokenCount = Math.min(argv.length, 3);
    tokenCount > 0;
    tokenCount -= 1
  ) {
    const commandName = argv.slice(0, tokenCount).join(":");
    const command = commands.get(commandName);

    if (command !== undefined) {
      return {
        name: commandName,
        command,
        argv: argv.slice(tokenCount),
      };
    }
  }

  return undefined;
}

function printHelp(): void {
  console.log("Usage: repo-tooling <command> [args]");
  console.log("");
  console.log("Commands:");

  for (const [name, command] of [...commands.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    console.log(`  ${name.padEnd(30)} ${command.description}`);
  }
}

function printCommandHelp(name: string, command: CommandDefinition): void {
  console.log(`Usage: repo-tooling ${name} [args]`);
  console.log("");
  console.log(command.description);
}
