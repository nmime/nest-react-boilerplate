import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { CommandContext } from "../../cli";

interface GenerateVerticalSliceOptions {
  workspaceRoot: string;
  argv: string[];
}

interface TemplateFile {
  path: string;
  contents: string;
}

interface Names {
  rawName: string;
  kebab: string;
  camel: string;
  pascal: string;
  title: string;
}

export function runGenerateVerticalSlice(
  options: GenerateVerticalSliceOptions,
): number {
  const parsed = parseOptions(options.argv);

  if (parsed.help) {
    printUsage();
    return 0;
  }

  if (parsed.name === undefined) {
    console.error(
      "Missing feature name. Example: pnpm generate:feature invoices",
    );
    printUsage();
    return 1;
  }

  const names = toNames(parsed.name);
  const validApiApps = listApiApps(options.workspaceRoot);

  if (!validApiApps.includes(parsed.apiApp)) {
    console.error(
      `Invalid --api-app "${parsed.apiApp}". Expected one of: ${validApiApps.join(
        ", ",
      ) || "(none found under apps/backend)"}.`,
    );
    return 1;
  }

  const files = [
    ...createTemplateFiles(names, parsed.apiApp),
    ...createSupportConfigFiles(names),
  ];
  const blocked = files.filter(
    (file) =>
      existsSync(join(options.workspaceRoot, file.path)) && !parsed.force,
  );

  const existingAliases = parsed.force
    ? []
    : findExistingTsconfigAliases(options.workspaceRoot, names);

  if (blocked.length > 0 || existingAliases.length > 0) {
    console.error(
      "Refusing to overwrite existing files or aliases. Re-run with --force if intentional:",
    );

    for (const file of blocked) {
      console.error(`- ${file.path}`);
    }

    for (const alias of existingAliases) {
      console.error(`- tsconfig alias ${alias}`);
    }

    return 1;
  }

  for (const file of files) {
    const absolutePath = join(options.workspaceRoot, file.path);

    if (parsed.dryRun) {
      console.log(`CREATE ${file.path}`);
      continue;
    }

    mkdirSync(join(absolutePath, ".."), { recursive: true });
    writeFileSync(absolutePath, file.contents);
    console.log(
      `${existsSync(absolutePath) ? "WROTE" : "CREATE"} ${file.path}`,
    );
  }

  if (parsed.dryRun) {
    console.log("UPDATE tsconfig.base.json path aliases");
  } else {
    updateTsconfigPaths(options.workspaceRoot, names);
    console.log("UPDATED tsconfig.base.json path aliases");
  }

  console.log("");
  console.log("Next steps:");
  console.log(
    `1. Add @app/feature-${names.kebab}-main to the ${parsed.apiApp} API module imports.`,
  );
  console.log(
    "2. Wire the generated client from the React route/page that owns this feature.",
  );
  console.log(
    "3. Replace placeholder persistence with a repository and commit a real migration.",
  );
  console.log("4. Run pnpm run lint && pnpm run typecheck && pnpm run test.");

  return 0;
}

function parseOptions(argv: string[]): {
  apiApp: string;
  dryRun: boolean;
  force: boolean;
  help: boolean;
  name?: string;
} {
  const parsed = {
    apiApp: "user-app-api",
    dryRun: false,
    force: false,
    help: false,
    name: undefined as string | undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }

    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }

    if (arg === "--force") {
      parsed.force = true;
      continue;
    }

    if (arg === "--api-app") {
      parsed.apiApp = argv[index + 1] ?? parsed.apiApp;
      index += 1;
      continue;
    }

    if (arg.startsWith("--api-app=")) {
      parsed.apiApp = arg.slice("--api-app=".length);
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    parsed.name ??= arg;
  }

  return parsed;
}

function listApiApps(workspaceRoot: string): string[] {
  const appsRoot = join(workspaceRoot, "apps/backend");

  try {
    return readdirSync(appsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((appName) => existsSync(join(appsRoot, appName, "project.json")))
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function findExistingTsconfigAliases(
  workspaceRoot: string,
  names: Names,
): string[] {
  const tsconfigPath = join(workspaceRoot, "tsconfig.base.json");
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8")) as {
    compilerOptions?: { paths?: Record<string, string[]> };
  };
  const paths = tsconfig.compilerOptions?.paths ?? {};

  return Object.keys(createTsconfigAliases(names)).filter((alias) =>
    Object.prototype.hasOwnProperty.call(paths, alias),
  );
}

function updateTsconfigPaths(workspaceRoot: string, names: Names): void {
  const tsconfigPath = join(workspaceRoot, "tsconfig.base.json");
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8")) as {
    compilerOptions: { paths?: Record<string, string[]> };
  };

  tsconfig.compilerOptions.paths = {
    ...(tsconfig.compilerOptions.paths ?? {}),
    ...createTsconfigAliases(names),
  };

  writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);
}

function createTsconfigAliases(names: Names): Record<string, string[]> {
  return {
    [`@app/feature-${names.kebab}-main`]: [
      `libs/backend/feature/${names.kebab}/main/lib/src/index.ts`,
    ],
    [`@app/feature-${names.kebab}-shared`]: [
      `libs/backend/feature/${names.kebab}/shared/lib/src/index.ts`,
    ],
    [`@app/postgres-main-${names.kebab}`]: [
      `libs/backend/postgres/main/${names.kebab}/lib/src/index.ts`,
    ],
  };
}

function createTemplateFiles(names: Names, apiApp: string): TemplateFile[] {
  const base = `libs/backend/feature/${names.kebab}`;

  return [
    {
      path: `${base}/shared/lib/src/index.ts`,
      contents: `export interface ${names.pascal}Dto {\n  id: string;\n  name: string;\n  createdAt: string;\n}\n\nexport interface Create${names.pascal}Dto {\n  name: string;\n}\n\nexport const ${constantName(names)}_READ_PERMISSION = "${names.kebab}:read";\nexport const ${constantName(names)}_WRITE_PERMISSION = "${names.kebab}:write";\n`,
    },
    projectJson(
      `${base}/shared/lib/project.json`,
      `@app/feature-${names.kebab}-shared`,
      `${base}/shared/lib/src`,
      `dist/${base}/shared`,
      `${base}/shared/lib/tsconfig.lib.json`,
      ["platform:shared", "type:feature-shared", `scope:${names.kebab}`],
    ),
    tsConfig(`${base}/shared/lib`, 6),
    {
      path: `${base}/main/lib/src/index.ts`,
      contents: `export * from "./lib/${names.kebab}.module";\nexport * from "./lib/${names.kebab}.controller";\nexport * from "./lib/${names.kebab}.service";\nexport * from "@app/feature-${names.kebab}-shared";\n`,
    },
    {
      path: `${base}/main/lib/src/lib/${names.kebab}.module.ts`,
      contents: `import { Module } from "@nestjs/common";\nimport { ${names.pascal}Controller } from "./${names.kebab}.controller";\nimport { ${names.pascal}Service } from "./${names.kebab}.service";\n\n@Module({\n  controllers: [${names.pascal}Controller],\n  providers: [${names.pascal}Service],\n  exports: [${names.pascal}Service],\n})\nexport class ${names.pascal}Module {}\n`,
    },
    {
      path: `${base}/main/lib/src/lib/${names.kebab}.service.ts`,
      contents: `import { Injectable } from "@nestjs/common";\nimport type { Create${names.pascal}Dto, ${names.pascal}Dto } from "@app/feature-${names.kebab}-shared";\n\n@Injectable()\nexport class ${names.pascal}Service {\n  async list(): Promise<${names.pascal}Dto[]> {\n    return [];\n  }\n\n  async create(input: Create${names.pascal}Dto): Promise<${names.pascal}Dto> {\n    const now = new Date().toISOString();\n\n    return {\n      id: crypto.randomUUID(),\n      name: input.name,\n      createdAt: now,\n    };\n  }\n}\n`,
    },
    {
      path: `${base}/main/lib/src/lib/${names.kebab}.controller.ts`,
      contents: `import { Body, Controller, Get, Post } from "@nestjs/common";\nimport { ApiProperty } from "@nestjs/swagger";\nimport { ApiOkDataResponse, ApiExceptions } from "@app/common/swagger";\nimport { createOkResponse, type OkResponse } from "@app/common/response";\nimport type { Create${names.pascal}Dto, ${names.pascal}Dto } from "@app/feature-${names.kebab}-shared";\nimport { ${names.pascal}Service } from "./${names.kebab}.service";\n\nclass Create${names.pascal}BodyDto implements Create${names.pascal}Dto {\n  @ApiProperty()\n  name!: string;\n}\n\nclass ${names.pascal}ResponseDto implements ${names.pascal}Dto {\n  @ApiProperty()\n  id!: string;\n\n  @ApiProperty()\n  name!: string;\n\n  @ApiProperty({ format: "date-time" })\n  createdAt!: string;\n}\n\n@ApiExceptions(400, 401, 403, 429, 500)\n@Controller("${names.kebab}")\nexport class ${names.pascal}Controller {\n  constructor(private readonly ${names.camel}Service: ${names.pascal}Service) {}\n\n  @Get()\n  @ApiOkDataResponse(${names.pascal}ResponseDto)\n  async list(): Promise<OkResponse<${names.pascal}Dto[]>> {\n    return createOkResponse(await this.${names.camel}Service.list());\n  }\n\n  @Post()\n  @ApiOkDataResponse(${names.pascal}ResponseDto)\n  async create(\n    @Body() input: Create${names.pascal}BodyDto,\n  ): Promise<OkResponse<${names.pascal}Dto>> {\n    return createOkResponse(await this.${names.camel}Service.create(input));\n  }\n}\n`,
    },
    {
      path: `${base}/main/lib/src/lib/${names.kebab}.service.spec.ts`,
      contents: `import { describe, expect, it } from "vitest";\nimport { ${names.pascal}Service } from "./${names.kebab}.service";\n\ndescribe("${names.pascal}Service", () => {\n  it("creates a ${names.title.toLowerCase()} placeholder", async () => {\n    await expect(new ${names.pascal}Service().create({ name: "Example" })).resolves.toMatchObject({\n      name: "Example",\n    });\n  });\n});\n`,
    },
    projectJson(
      `${base}/main/lib/project.json`,
      `@app/feature-${names.kebab}-main`,
      `${base}/main/lib/src`,
      `dist/${base}/main`,
      `${base}/main/lib/tsconfig.lib.json`,
      ["platform:backend", "type:feature-main", `scope:${names.kebab}`],
    ),
    tsConfig(`${base}/main/lib`, 6),
    {
      path: `libs/backend/postgres/main/${names.kebab}/lib/src/index.ts`,
      contents: `export * from "./lib/entity/${names.kebab}.entity";\nexport * from "./lib/migrations";\n`,
    },
    {
      path: `libs/backend/postgres/main/${names.kebab}/lib/src/lib/entity/${names.kebab}.entity.ts`,
      contents: `import { Entity, PrimaryKey, Property } from "@mikro-orm/core";\n\n@Entity({ tableName: "${names.kebab.replaceAll("-", "_")}" })\nexport class ${names.pascal}Entity {\n  @PrimaryKey({ type: "uuid" })\n  id!: string;\n\n  @Property()\n  name!: string;\n\n  @Property({ type: "timestamptz" })\n  createdAt: Date = new Date();\n}\n`,
    },
    {
      path: `libs/backend/postgres/main/${names.kebab}/lib/src/lib/migrations/Migration00000000000000Create${names.pascal}.ts`,
      contents: `import { Migration } from "@mikro-orm/migrations";\n\nexport class Migration00000000000000Create${names.pascal} extends Migration {\n  override async up(): Promise<void> {\n    this.addSql('create table "${names.kebab.replaceAll("-", "_")}" ("id" uuid not null, "name" varchar(255) not null, "created_at" timestamptz not null, constraint "${names.kebab.replaceAll("-", "_")}_pkey" primary key ("id"));');\n  }\n\n  override async down(): Promise<void> {\n    this.addSql('drop table if exists "${names.kebab.replaceAll("-", "_")}" cascade;');\n  }\n}\n`,
    },
    {
      path: `libs/backend/postgres/main/${names.kebab}/lib/src/lib/migrations/index.ts`,
      contents: `export * from "./Migration00000000000000Create${names.pascal}";\n`,
    },
    projectJson(
      `libs/backend/postgres/main/${names.kebab}/lib/project.json`,
      `@app/postgres-main-${names.kebab}`,
      `libs/backend/postgres/main/${names.kebab}/lib/src`,
      `dist/libs/backend/postgres/main/${names.kebab}`,
      `libs/backend/postgres/main/${names.kebab}/lib/tsconfig.lib.json`,
      ["platform:backend", "type:database", `scope:${names.kebab}`],
    ),
    tsConfig(`libs/backend/postgres/main/${names.kebab}/lib`, 5),
    {
      path: `libs/frontend/api-client/lib/src/features/${names.kebab}.ts`,
      contents: `import type { Create${names.pascal}Dto, ${names.pascal}Dto } from "@app/feature-${names.kebab}-shared";\n\nexport interface ${names.pascal}ApiClient {\n  list${names.pascal}s(): Promise<${names.pascal}Dto[]>;\n  create${names.pascal}(input: Create${names.pascal}Dto): Promise<${names.pascal}Dto>;\n}\n\nexport function create${names.pascal}ApiClient(\n  request: <T>(path: string, init?: RequestInit) => Promise<T>,\n): ${names.pascal}ApiClient {\n  return {\n    list${names.pascal}s: () => request<${names.pascal}Dto[]>("/${names.kebab}"),\n    create${names.pascal}: (input) =>\n      request<${names.pascal}Dto>("/${names.kebab}", {\n        body: JSON.stringify(input),\n        headers: { "content-type": "application/json" },\n        method: "POST",\n      }),\n  };\n}\n`,
    },
    {
      path: `apps/frontend/app/src/app/features/${names.kebab}/${names.pascal}Page.tsx`,
      contents: `export function ${names.pascal}Page() {\n  return (\n    <section aria-labelledby="${names.kebab}-title">\n      <h1 id="${names.kebab}-title">${names.title}</h1>\n      <p>Wire this page to create${names.pascal}ApiClient and the generated ${apiApp} route.</p>\n    </section>\n  );\n}\n`,
    },
    {
      path: `docs/features/${names.kebab}/test-checklist.md`,
      contents: `# ${names.title} test checklist\n\n- [ ] DTO validation rejects malformed input.\n- [ ] Controller spec covers success, auth, RBAC, and problem responses.\n- [ ] Service spec covers happy path, idempotency, and provider failures.\n- [ ] Migration applies, rolls back, and is included in db:migrations:check.\n- [ ] API contract and generated client are refreshed.\n- [ ] React page has loading, empty, error, and success states.\n- [ ] E2E smoke covers the first user-visible workflow.\n`,
    },
  ];
}

function createSupportConfigFiles(names: Names): TemplateFile[] {
  const roots = [
    `libs/backend/feature/${names.kebab}/shared/lib`,
    `libs/backend/feature/${names.kebab}/main/lib`,
    `libs/backend/postgres/main/${names.kebab}/lib`,
  ];

  return roots.flatMap((root) => [
    tsConfigLib(root),
    tsConfigSpec(root),
    vitestConfig(root),
    eslintConfig(root),
  ]);
}

function relativePrefix(root: string): string {
  return root
    .split("/")
    .map(() => "..")
    .join("/");
}

function tsConfigLib(root: string): TemplateFile {
  const outRoot = root.replace("/lib", "");

  return {
    path: `${root}/tsconfig.lib.json`,
    contents: `${JSON.stringify(
      {
        extends: "./tsconfig.json",
        compilerOptions: {
          outDir: `${relativePrefix(root)}/dist/out-tsc/${outRoot}`,
          types: ["node"],
          declaration: true,
        },
        exclude: ["src/**/*.spec.ts", "src/**/*.test.ts"],
        include: ["src/**/*.ts"],
      },
      null,
      2,
    )}\n`,
  };
}

function tsConfigSpec(root: string): TemplateFile {
  const outRoot = root.replace("/lib", "");

  return {
    path: `${root}/tsconfig.spec.json`,
    contents: `${JSON.stringify(
      {
        extends: "./tsconfig.json",
        compilerOptions: {
          outDir: `${relativePrefix(root)}/dist/out-tsc/${outRoot}-spec`,
          types: ["node", "vitest"],
        },
        include: ["src/**/*.spec.ts", "src/**/*.test.ts", "src/**/*.ts"],
      },
      null,
      2,
    )}\n`,
  };
}

function vitestConfig(root: string): TemplateFile {
  const prefix = relativePrefix(root);
  const coverageRoot = root.replace("/lib", "");

  return {
    path: `${root}/vitest.config.mts`,
    contents: `/// <reference types="vitest" />\nimport tsconfigPaths from "vite-tsconfig-paths";\nimport { defineConfig } from "vitest/config";\n// nx-ignore-next-line\nimport { fullCoverage } from "${prefix}/packages/tooling/src/testing/vitest-coverage.mts";\n\nexport default defineConfig({\n  plugins: [tsconfigPaths()],\n  cacheDir: "${prefix}/dist/out-tsc/${coverageRoot}",\n  test: {\n    environment: "node",\n    include: ["src/**/*.spec.ts"],\n    globals: false,\n    coverage: fullCoverage("${prefix}/coverage/${coverageRoot}", ["src/**/*.ts"], []),\n  },\n});\n`,
  };
}

function eslintConfig(root: string): TemplateFile {
  const prefix = relativePrefix(root);

  return {
    path: `${root}/eslint.config.cjs`,
    contents: `const baseConfig = require("${prefix}/eslint.config.js");\n\nmodule.exports = [\n  {\n    ignores: [\n      "eslint.config.cjs",\n      "project.json",\n      "tsconfig*.json",\n      "vitest.config.mts",\n    ],\n  },\n  ...baseConfig,\n  {\n    languageOptions: {\n      parserOptions: {\n        project: "tsconfig.*?.json",\n      },\n    },\n  },\n];\n`,
  };
}

function projectJson(
  path: string,
  name: string,
  sourceRoot: string,
  outputPath: string,
  tsConfig: string,
  tags: string[],
): TemplateFile {
  return {
    path,
    contents: `${JSON.stringify(
      {
        name,
        $schema:
          path.split("/").length > 5
            ? "../../../../../node_modules/nx/schemas/project-schema.json"
            : "../../../../node_modules/nx/schemas/project-schema.json",
        sourceRoot,
        projectType: "library",
        tags,
        targets: {
          build: {
            executor: "@nx/js:tsc",
            outputs: ["{options.outputPath}"],
            options: {
              outputPath,
              main: `${sourceRoot}/index.ts`,
              tsConfig,
              assets: [],
            },
          },
          test: {
            executor: "nx:run-commands",
            cache: true,
            options: {
              cwd: path.replace("/project.json", ""),
              command: "vitest run --config vitest.config.mts",
            },
            inputs: [
              "default",
              "^production",
              { externalDependencies: ["vitest"] },
            ],
            outputs: [
              `{workspaceRoot}/coverage/${outputPath.replace(/^dist\//, "")}`,
            ],
          },
        },
      },
      null,
      2,
    )}\n`,
  };
}

function tsConfig(root: string, depth: number): TemplateFile {
  const prefix = Array.from({ length: depth }, () => "..").join("/");

  return {
    path: `${root}/tsconfig.json`,
    contents: `{"extends":"${prefix}/tsconfig.base.json","compilerOptions":{"types":["node"]},"include":[],"references":[{"path":"./tsconfig.lib.json"},{"path":"./tsconfig.spec.json"}]}\n`,
  };
}

function toNames(rawName: string): Names {
  const kebab = rawName
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  if (kebab === "") {
    throw new Error("Feature name must include at least one letter or number.");
  }

  const words = kebab.split("-");
  const pascal = words.map(capitalize).join("");

  return {
    rawName,
    kebab,
    camel: `${pascal.charAt(0).toLowerCase()}${pascal.slice(1)}`,
    pascal,
    title: words.map(capitalize).join(" "),
  };
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function constantName(names: Names): string {
  return names.kebab.replaceAll("-", "_").toUpperCase();
}

function printUsage(): void {
  console.log(
    `Usage: repo-tooling project generate-vertical-slice <feature-name> [--api-app user-app-api] [--dry-run] [--force]\n\nCreates a checklist-driven vertical slice scaffold: shared DTOs, Nest module/controller/service, PostgreSQL entity/migration placeholder, frontend API client, React page stub, and feature test checklist.`,
  );
}

export function runGenerateVerticalSliceFromContext(
  context: CommandContext,
): number {
  return runGenerateVerticalSlice({
    argv: context.argv,
    workspaceRoot: context.workspaceRoot,
  });
}
