import { dirname, resolve } from "node:path";
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
  "Run node --check and safe import smoke checks for repo tooling scripts.",
  ({ workspaceRoot }) => runStaticCheck({ workspaceRoot }),
);
register(
  "tooling:changed-format-check",
  "Run Prettier only on changed files for PR memory-safe formatting validation.",
  ({ argv, workspaceRoot }) => runChangedFormatCheck({ argv, workspaceRoot }),
);

registerLegacy(
  "testing:storybook",
  "Run Storybook interaction tests.",
  "scripts/testing/storybook-test.mjs",
);
registerLegacy(
  "testing:storybook-visual",
  "Run Storybook visual regression tests.",
  "scripts/testing/storybook-visual-regression.mjs",
);
registerLegacy(
  "db:migrate",
  "Run database migrations.",
  "scripts/db/migrate.mjs",
);
registerLegacy(
  "db:migrations:check",
  "Check database migration naming and drift.",
  "scripts/db/migrations-check.mjs",
);
registerLegacy(
  "db:migrations:rollback-check",
  "Run auth migrations up/down/up against disposable PostgreSQL.",
  "scripts/db/migrations-rollback-check.mjs",
);
registerLegacy("db:reset", "Reset the local database.", "scripts/db/reset.mjs");
registerLegacy("db:seed", "Seed the local database.", "scripts/db/seed.mjs");
registerLegacy(
  "db:backup",
  "Create a PostgreSQL backup.",
  "scripts/db/backup.mjs",
);
registerLegacy(
  "db:restore",
  "Restore a PostgreSQL backup.",
  "scripts/db/restore.mjs",
);
registerLegacy(
  "db:restore-drill",
  "Run a PostgreSQL backup/restore drill or CI-safe dry-run.",
  "scripts/db/restore-drill.mjs",
);
registerLegacy(
  "dev:fullstack",
  "Run the local fullstack dev helper.",
  "scripts/dev/fullstack.mjs",
);
registerLegacy(
  "docker:smoke",
  "Run Docker smoke checks.",
  "scripts/docker/smoke.mjs",
);
registerLegacy(
  "docker:fullstack-e2e",
  "Run Docker fullstack e2e checks.",
  "scripts/docker/fullstack-e2e.mjs",
);
registerLegacy(
  "project:init",
  "Initialize project placeholders.",
  "scripts/project/init-project.mjs",
);
registerLegacy(
  "api:openapi",
  "Export OpenAPI contracts.",
  "scripts/api/export-openapi.mjs",
);
registerLegacy(
  "api:client",
  "Generate one API client.",
  "scripts/api/generate-client.mjs",
);
registerLegacy(
  "api:clients",
  "Generate API clients.",
  "scripts/api/generate-clients.mjs",
);
registerLegacy(
  "api:clients:check",
  "Check generated API clients.",
  "scripts/api/check-clients.mjs",
);
registerLegacy(
  "api:contracts",
  "Generate API contracts.",
  "scripts/api/generate-contracts.mjs",
);
registerLegacy(
  "api:contracts:check",
  "Check generated API contracts.",
  "scripts/api/check-contracts.mjs",
);
registerLegacy(
  "qa:consumer-contracts",
  "Validate consumer contracts.",
  "scripts/qa/consumer-contracts.mjs",
);
registerLegacy(
  "qa:openapi-lint",
  "Lint OpenAPI contracts.",
  "scripts/qa/openapi-lint.mjs",
);
registerLegacy(
  "qa:openapi-fuzz",
  "Generate OpenAPI fuzz cases.",
  "scripts/qa/openapi-fuzz.mjs",
);
registerLegacy(
  "qa:accessibility",
  "Run accessibility checks.",
  "scripts/qa/accessibility.mjs",
);
registerLegacy(
  "qa:cross-browser-e2e",
  "Run cross-browser e2e matrix.",
  "scripts/qa/cross-browser-e2e.mjs",
);
registerLegacy(
  "qa:performance",
  "Run performance checks.",
  "scripts/qa/performance.mjs",
);
registerLegacy(
  "qa:security-sast",
  "Run SAST checks.",
  "scripts/qa/security-sast.mjs",
);
registerLegacy(
  "qa:secret-scan",
  "Run secret scanning checks.",
  "scripts/qa/secret-scan.mjs",
);
registerLegacy(
  "qa:security-dast",
  "Run DAST checks.",
  "scripts/qa/security-dast.mjs",
);
registerLegacy(
  "qa:security-suite",
  "Run the security suite.",
  "scripts/qa/security-suite.mjs",
);
registerLegacy(
  "qa:property",
  "Run property-based checks.",
  "scripts/qa/property.mjs",
);
registerLegacy(
  "qa:world-class-gates",
  "Run world-class quality gates.",
  "scripts/qa/world-class-gates.mjs",
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

  return await resolved.command.handler({
    argv: resolved.argv,
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

function registerLegacy(
  name: string,
  description: string,
  scriptPath: string,
): void {
  register(name, description, ({ argv, packageRoot, workspaceRoot }) => {
    const result = run(
      process.execPath,
      [resolve(packageRoot, scriptPath), ...argv],
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
