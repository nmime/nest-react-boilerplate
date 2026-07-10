/**
 * Feature generator — generates vertical-slice features across backend
 * and frontend layers, preserving the current vertical-slice semantics.
 *
 * Uses the shared operation generation from the existing vertical-slice
 * templates, applied through the Nx Tree adapter.
 */
import type { Tree } from "nx/src/generators/tree";
import { formatFiles, getProjects } from "@nx/devkit";
import { generateNames, validateName } from "../names.js";
import { createNxTreeAdapter, readJsonFile, mergeJsonFile, writeJsonFile } from "../../setup/adapters/nx-tree.js";

// ---------------------------------------------------------------------------
// Types matching the existing vertical-slice implementation
// ---------------------------------------------------------------------------

interface TemplateFile {
  path: string;
  contents: string;
}

// ---------------------------------------------------------------------------
// Name aliases (matching existing implementation)
// ---------------------------------------------------------------------------

function backendFeatureMainAlias(names: ReturnType<typeof generateNames>): string {
  return `@app/backend-feature-${names.kebab}-main`;
}

function backendFeatureSharedAlias(names: ReturnType<typeof generateNames>): string {
  return `@app/backend-feature-${names.kebab}-shared`;
}

function backendPostgresMainAlias(names: ReturnType<typeof generateNames>): string {
  return `@app/backend-postgres-main-${names.kebab}`;
}

function constantName(names: ReturnType<typeof generateNames>): string {
  return names.constant + "_";
}

// ---------------------------------------------------------------------------
// project.json generator (matching existing implementation)
// ---------------------------------------------------------------------------

function projectJson(
  path: string,
  name: string,
  sourceRoot: string,
  outputPath: string,
  tsConfig: string,
  tags: string[],
): TemplateFile {
  const schema = `${"\\"}schema": "${path.startsWith("libs/backend/postgres") ? "../../../../../../../" : "../../../../../../"}node_modules/nx/schemas/project-schema.json"`;
  
  return {
    path: `${path}/project.json`,
    contents: JSON.stringify({
      name,
      $schema: "../../../../node_modules/nx/schemas/project-schema.json",
      sourceRoot: `${sourceRoot}`,
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
            rootDir: ".",
          },
        },
        test: {
          executor: "nx:run-commands",
          cache: true,
          options: {
            cwd: path,
            command: "vitest run --config vitest.config.mts",
          },
          inputs: ["default", "^production", { externalDependencies: ["vitest"] }],
          outputs: [`{workspaceRoot}/coverage/${path}`],
        },
      },
    }, null, 2) + "\n",
  };
}

// ---------------------------------------------------------------------------
// tsconfig generator (matching existing implementation)
// ---------------------------------------------------------------------------

function tsConfig(path: string): TemplateFile {
  const depth = (path.match(/\/lib\//) ? path : `${path}/`).split("/").length;
  const offset = "··".repeat(Math.max(0, depth - 2));
  
  return {
    path: `${path}/tsconfig.lib.json`,
    contents: JSON.stringify({
      extends: `${offset}../../tsconfig.base.json`,
      compilerOptions: {
        module: "commonjs",
        forceConsistentCasingInFileNames: true,
        strict: true,
        noImplicitOverride: true,
        noImplicitReturns: true,
        noFallthroughCasesInSwitch: true,
        noPropertyAccessFromIndexSignature: true,
        noEmit: true,
        declaration: false,
        inlineSources: false,
        isolatedModules: true,
        moduleResolution: "bundler",
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
        target: "es2022",
        lib: ["es2022"],
        skipLibCheck: true,
        skipDefaultLibCheck: true,
        baseUrl: ".",
        paths: {},
      },
      include: ["src/**/*.ts"],
      exclude: ["**/*.spec.ts", "**/*.test.ts"],
    }, null, 2) + "\n",
  };
}

// ---------------------------------------------------------------------------
// Template file generators (preserving existing vertical-slice semantics)
// ---------------------------------------------------------------------------

function createBackendTemplateFiles(
  names: ReturnType<typeof generateNames>,
  apiApp: string,
): TemplateFile[] {
  const base = `libs/backend/feature/${names.kebab}`;
  const mainAlias = backendFeatureMainAlias(names);
  const sharedAlias = backendFeatureSharedAlias(names);

  return [
    // Shared library
    {
      path: `${base}/shared/lib/src/index.ts`,
      contents: `export interface ${names.pascal}Dto {\n  id: string;\n  name: string;\n  createdAt: string;\n}\n\nexport interface Create${names.pascal}Dto {\n  name: string;\n}\n\nexport const ${constantName(names)}READ_PERMISSION = "${names.kebab}:read";\nexport const ${constantName(names)}WRITE_PERMISSION = "${names.kebab}:write";\n`,
    },
    projectJson(
      `${base}/shared/lib`,
      sharedAlias,
      `${base}/shared/lib/src`,
      `dist/${base}/shared`,
      `${base}/shared/lib/tsconfig.lib.json`,
      ["platform:backend", "type:feature-shared", `scope:${names.kebab}`],
    ),
    tsConfig(`${base}/shared/lib`),

    // Main library
    {
      path: `${base}/main/lib/src/index.ts`,
      contents: `export * from "./${names.kebab}.module";\nexport * from "./${names.kebab}.controller";\nexport * from "./${names.kebab}.service";\nexport * from "${sharedAlias}";\n`,
    },
    {
      path: `${base}/main/lib/src/${names.kebab}.module.ts`,
      contents: `import { Module } from "@nestjs/common";\nimport { ${names.pascal}Controller } from "./${names.kebab}.controller";\nimport { ${names.pascal}Service } from "./${names.kebab}.service";\n\n@Module({\n  controllers: [${names.pascal}Controller],\n  providers: [${names.pascal}Service],\n  exports: [${names.pascal}Service],\n})\nexport class ${names.pascal}Module {}\n`,
    },
    {
      path: `${base}/main/lib/src/${names.kebab}.service.ts`,
      contents: `import { Injectable } from "@nestjs/common";\nimport type { Create${names.pascal}Dto, ${names.pascal}Dto } from "${sharedAlias}";\n\n@Injectable()\nexport class ${names.pascal}Service {\n  async list(): Promise<${names.pascal}Dto[]> {\n    return [];\n  }\n\n  async create(input: Create${names.pascal}Dto): Promise<${names.pascal}Dto> {\n    const now = new Date().toISOString();\n\n    return {\n      id: crypto.randomUUID(),\n      name: input.name,\n      createdAt: now,\n    };\n  }\n}\n`,
    },
    {
      path: `${base}/main/lib/src/${names.kebab}.controller.ts`,
      contents: `import { Body, Controller, Get, Post } from "@nestjs/common";\nimport { ApiProperty } from "@nestjs/swagger";\nimport { ApiOkDataResponse, ApiExceptions } from "@app/backend-common-swagger";\nimport { createOkResponse, type OkResponse } from "@app/backend-common-response";\nimport type { Create${names.pascal}Dto, ${names.pascal}Dto } from "${sharedAlias}";\nimport { ${names.pascal}Service } from "./${names.kebab}.service";\n\nclass Create${names.pascal}BodyDto implements Create${names.pascal}Dto {\n  @ApiProperty()\n  name!: string;\n}\n\nclass ${names.pascal}ResponseDto implements ${names.pascal}Dto {\n  @ApiProperty()\n  id!: string;\n\n  @ApiProperty()\n  name!: string;\n\n  @ApiProperty({ format: "date-time" })\n  createdAt!: string;\n}\n\n@ApiExceptions(400, 401, 403, 429, 500)\n@Controller("${names.kebab}")\nexport class ${names.pascal}Controller {\n  constructor(private readonly ${names.camel}Service: ${names.pascal}Service) {}\n\n  @Get()\n  @ApiOkDataResponse(${names.pascal}ResponseDto)\n  async list(): Promise<OkResponse<${names.pascal}Dto[]>> {\n    return createOkResponse(await this.${names.camel}Service.list());\n  }\n\n  @Post()\n  @ApiOkDataResponse(${names.pascal}ResponseDto)\n  async create(\n    @Body() input: Create${names.pascal}BodyDto,\n  ): Promise<OkResponse<${names.pascal}Dto>> {\n    return createOkResponse(await this.${names.camel}Service.create(input));\n  }\n}\n`,
    },
    {
      path: `${base}/main/lib/src/${names.kebab}.service.spec.ts`,
      contents: `import { describe, expect, it } from "vitest";\nimport { ${names.pascal}Service } from "./${names.kebab}.service";\n\ndescribe("${names.pascal}Service", () => {\n  it("creates a ${names.title.toLowerCase()} placeholder", async () => {\n    await expect(new ${names.pascal}Service().create({ name: "Example" })).resolves.toMatchObject({\n      name: "Example",\n    });\n  });\n});\n`,
    },
    projectJson(
      `${base}/main/lib`,
      mainAlias,
      `${base}/main/lib/src`,
      `dist/${base}/main`,
      `${base}/main/lib/tsconfig.lib.json`,
      ["platform:backend", "type:feature-main", `scope:${names.kebab}`],
    ),
    tsConfig(`${base}/main/lib`),

    // Postgres data access
    {
      path: `libs/backend/postgres/main/${names.kebab}/lib/src/index.ts`,
      contents: `export * from "./infrastructure/data-access";\n`,
    },
    {
      path: `libs/backend/postgres/main/${names.kebab}/lib/src/infrastructure/data-access/index.ts`,
      contents: `export * from "./entities";\nexport * from "./repositories";\nexport * from "./migrations";\n`,
    },
    {
      path: `libs/backend/postgres/main/${names.kebab}/lib/src/infrastructure/data-access/entities/${names.kebab}.entity.ts`,
      contents: `import { randomUUID } from "node:crypto";\nimport { EntitySchema } from "@mikro-orm/core";\n\nexport interface ${names.pascal}EntityInput {\n  name: string;\n}\n\nexport class ${names.pascal}Entity {\n  id: string = randomUUID();\n  name!: string;\n  createdAt: Date = new Date();\n\n  constructor(input?: ${names.pascal}EntityInput) {\n    if (input) {\n      this.name = input.name;\n    }\n  }\n}\n\nexport const ${names.pascal}EntitySchema = new EntitySchema<${names.pascal}Entity>({\n  class: ${names.pascal}Entity,\n  tableName: "${names.kebab.replaceAll("-", "_")}",\n  properties: {\n    id: { type: "uuid", primary: true },\n    name: { type: "varchar", length: 255 },\n    createdAt: {\n      type: "timestamptz",\n      fieldName: "created_at",\n      onCreate: () => new Date(),\n    },\n  },\n});\n`,
    },
    {
      path: `libs/backend/postgres/main/${names.kebab}/lib/src/infrastructure/data-access/entities/index.ts`,
      contents: `export * from "./${names.kebab}.entity";\n`,
    },
    {
      path: `libs/backend/postgres/main/${names.kebab}/lib/src/infrastructure/data-access/repositories/${names.kebab}.repository.ts`,
      contents: `import { EntityManager } from "@mikro-orm/core";\nimport { Inject, Injectable } from "@nestjs/common";\nimport { ${names.pascal}Entity } from "../entities";\n\n@Injectable()\nexport class ${names.pascal}Repository {\n  constructor(\n    @Inject(EntityManager)\n    private readonly entityManager: EntityManager,\n  ) {}\n\n  async list(): Promise<${names.pascal}Entity[]> {\n    return this.entityManager.find(${names.pascal}Entity, {});\n  }\n\n  async create(name: string): Promise<${names.pascal}Entity> {\n    const entity = new ${names.pascal}Entity({ name });\n    this.entityManager.persist(entity);\n    await this.entityManager.flush();\n\n    return entity;\n  }\n}\n`,
    },
    {
      path: `libs/backend/postgres/main/${names.kebab}/lib/src/infrastructure/data-access/repositories/index.ts`,
      contents: `export * from "./${names.kebab}.repository";\n`,
    },
    {
      path: `libs/backend/postgres/main/${names.kebab}/lib/src/infrastructure/data-access/migrations/Migration00000000000000Create${names.pascal}.ts`,
      contents: `import { Migration } from "@mikro-orm/migrations";\n\nexport class Migration00000000000000Create${names.pascal} extends Migration {\n  override async up(): Promise<void> {\n    this.addSql('create table "${names.kebab.replaceAll("-", "_")}" ("id" uuid not null, "name" varchar(255) not null, "created_at" timestamptz not null, constraint "${names.kebab.replaceAll("-", "_")}_pkey" primary key ("id"));');\n  }\n\n  override async down(): Promise<void> {\n    this.addSql('drop table if exists "${names.kebab.replaceAll("-", "_")}" cascade;');\n  }\n}\n`,
    },
    {
      path: `libs/backend/postgres/main/${names.kebab}/lib/src/infrastructure/data-access/migrations/index.ts`,
      contents: `export * from "./Migration00000000000000Create${names.pascal}";\n`,
    },
    projectJson(
      `libs/backend/postgres/main/${names.kebab}/lib`,
      backendPostgresMainAlias(names),
      `libs/backend/postgres/main/${names.kebab}/lib/src`,
      `dist/libs/backend/postgres/main/${names.kebab}`,
      `libs/backend/postgres/main/${names.kebab}/lib/tsconfig.lib.json`,
      ["platform:backend", "type:data-access", `scope:${names.kebab}`],
    ),
    tsConfig(`libs/backend/postgres/main/${names.kebab}/lib`),

    // Frontend API client
    {
      path: `libs/frontend/api-client/lib/src/features/${names.kebab}.ts`,
      contents: `import type { Create${names.pascal}Dto, ${names.pascal}Dto } from "${sharedAlias}";\n\nexport interface ${names.pascal}ApiClient {\n  list${names.pascal}s(): Promise<${names.pascal}Dto[]>;\n  create${names.pascal}(input: Create${names.pascal}Dto): Promise<${names.pascal}Dto>;\n}\n\nexport function create${names.pascal}ApiClient(\n  request: <T>(path: string, init?: RequestInit) => Promise<T>,\n): ${names.pascal}ApiClient {\n  return {\n    list${names.pascal}s: () => request<${names.pascal}Dto[]>("/${names.kebab}"),\n    create${names.pascal}: (input) => request<${names.pascal}Dto>("/${names.kebab}", { method: "POST", body: JSON.stringify(input) }),\n  };\n}\n`,
    },

    // Frontend page
    {
      path: `apps/frontend/app/src/app/features/${names.kebab}/${names.pascal}Page.tsx`,
      contents: `export function ${names.pascal}Page() {\n  return (\n    <div>\n      <h1>${names.title}</h1>\n      <p>Generated ${apiApp} route — replace with real implementation.</p>\n    </div>\n  );\n}\n`,
    },
  ];
}

// ---------------------------------------------------------------------------
// tsconfig path aliases
// ---------------------------------------------------------------------------

function createTsconfigAliases(names: ReturnType<typeof generateNames>): Record<string, string[]> {
  return {
    [backendFeatureMainAlias(names)]: [
      `libs/backend/feature/${names.kebab}/main/lib/src/index.ts`,
    ],
    [backendFeatureSharedAlias(names)]: [
      `libs/backend/feature/${names.kebab}/shared/lib/src/index.ts`,
    ],
    [backendPostgresMainAlias(names)]: [
      `libs/backend/postgres/main/${names.kebab}/lib/src/index.ts`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

function findExistingTsconfigAliases(
  tree: Tree,
  names: ReturnType<typeof generateNames>,
): string[] {
  const tsconfig = readJsonFile(tree, "tsconfig.base.json");
  const paths = tsconfig?.compilerOptions?.paths ?? {};
  const newAliases = createTsconfigAliases(names);
  return Object.keys(newAliases).filter((alias) => Object.prototype.hasOwnProperty.call(paths, alias));
}

function findExistingFiles(
  tree: Tree,
  files: TemplateFile[],
): string[] {
  return files.filter((f) => tree.exists(f.path)).map((f) => f.path);
}

// ---------------------------------------------------------------------------
// API app validation
// ---------------------------------------------------------------------------

function listApiApps(tree: Tree): string[] {
  const projects = getProjects(tree);
  const apiApps: string[] = [];
  for (const [name, config] of projects.entries()) {
    if (config.root?.startsWith("apps/backend/") && config.tags?.includes("type:backend-app")) {
      apiApps.push(name);
    }
  }
  return apiApps.sort();
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export interface FeatureGeneratorOptions {
  name: string;
  apiApp?: string;
  force?: boolean;
  dryRun?: boolean;
  skipFormat?: boolean;
}

/**
 * Main generator entry point.
 * Preserves existing vertical-slice semantics by generating the same
 * file structure and content through the Nx Tree.
 */
export async function featureGenerator(
  tree: Tree,
  options: FeatureGeneratorOptions,
): Promise<void> {
  // Validate name
  const nameError = validateName(options.name);
  if (nameError) {
    throw new Error(nameError);
  }

  const names = generateNames(options.name);
  const apiApp = options.apiApp ?? "user-app-api";

  // Validate apiApp
  const validApiApps = listApiApps(tree);
  // If no projects found (e.g., in-memory tree without existing apps), allow it
  if (validApiApps.length > 0 && !validApiApps.includes(apiApp)) {
    throw new Error(
      `Invalid --api-app "${apiApp}". Expected one of: ${validApiApps.join(", ") || "(none found under apps/backend)"}.`,
    );
  }

  // Generate template files
  const files = createBackendTemplateFiles(names, apiApp);

  // Check for conflicts
  if (!options.force) {
    const existingFiles = findExistingFiles(tree, files);
    const existingAliases = findExistingTsconfigAliases(tree, names);

    if (existingFiles.length > 0 || existingAliases.length > 0) {
      const conflicts: string[] = [];
      for (const path of existingFiles) {
        conflicts.push(`File exists: ${path}`);
      }
      for (const alias of existingAliases) {
        conflicts.push(`Tsconfig alias exists: ${alias}`);
      }
      throw new Error(
        `Refusing to overwrite existing files or aliases. Re-run with --force:\n${conflicts.join("\n")}`,
      );
    }
  }

  // Write files to tree
  for (const file of files) {
    if (options.dryRun) {
      console.log(`CREATE ${file.path}`);
    } else {
      tree.write(file.path, file.contents);
    }
  }

  // Update tsconfig.base.json path aliases
  if (!options.dryRun) {
    const tsconfig = readJsonFile<Record<string, unknown>>(tree, "tsconfig.base.json");
    if (tsconfig) {
      const compilerOptions = (tsconfig.compilerOptions ?? {}) as Record<string, unknown>;
      const paths = (compilerOptions.paths ?? {}) as Record<string, string[]>;
      const newAliases = createTsconfigAliases(names);
      compilerOptions.paths = { ...paths, ...newAliases };
      writeJsonFile(tree, "tsconfig.base.json", tsconfig);
    }
  } else {
    console.log("UPDATE tsconfig.base.json path aliases");
  }

  // Print next steps
  if (options.dryRun) {
    console.log("");
    console.log("Next steps:");
    console.log(`1. Add ${backendFeatureMainAlias(names)} to the ${apiApp} API module imports.`);
    console.log("2. Wire the generated client from the React route/page that owns this feature.");
    console.log("3. Replace placeholder persistence with a repository and commit a real migration.");
    console.log("4. Run pnpm run lint && pnpm run typecheck && pnpm run test.");
  }

  // Format unless skipped
  if (!options.skipFormat && !options.dryRun) {
    await formatFiles(tree);
  }
}

// ---------------------------------------------------------------------------

export default featureGenerator;
