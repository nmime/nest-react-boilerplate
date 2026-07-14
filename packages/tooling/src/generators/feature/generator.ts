/**
 * Feature generator — generates vertical-slice features across backend
 * and frontend layers, preserving the current vertical-slice semantics.
 *
 * Uses the shared template generation from the existing vertical-slice
 * implementation, applied through the Nx Tree.
 *
 * Generated files match exact repo conventions for:
 *   - tsconfig.lib.json extends ./tsconfig.json (NOT base)
 *   - tsconfig.json references lib + spec
 *   - project.json $schema computed from depth
 *   - vitest.config.mts uses workspaceTsconfigAliases
 */
import type { Tree } from 'nx/src/generators/tree';
import { formatFiles, getProjects } from '@nx/devkit';
import { generateNames, validateName } from '../names.ts';
import { readJsonFile, writeJsonFile } from '../../setup/adapters/nx-tree.ts';

// ---------------------------------------------------------------------------

interface TemplateFile {
  path: string;
  contents: string;
}

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

function permissionReadName(names: ReturnType<typeof generateNames>): string {
  return names.pascal + 'ReadPermission';
}

function permissionWriteName(names: ReturnType<typeof generateNames>): string {
  return names.pascal + 'WritePermission';
}

function libDepth(dir: string): number {
  return dir.split('/').length;
}

function dots(dir: string): string {
  return '../'.repeat(libDepth(dir));
}

// ---------------------------------------------------------------------------

function projectJson(
  libDir: string,
  name: string,
  sourceRoot: string,
  outputPath: string,
  tags: string[],
): TemplateFile {
  const d = dots(libDir);
  return {
    path: `${libDir}/project.json`,
    contents:
      JSON.stringify(
        {
          name,
          $schema: `${d}node_modules/nx/schemas/project-schema.json`,
          sourceRoot,
          projectType: 'library',
          tags,
          targets: {
            build: {
              executor: '@nx/js:tsc',
              outputs: ['{options.outputPath}'],
              options: {
                outputPath,
                main: `${sourceRoot}/index.ts`,
                tsConfig: `${libDir}/tsconfig.lib.json`,
                assets: [],
                rootDir: '.',
              },
            },
            test: {
              executor: 'nx:run-commands',
              cache: true,
              options: {
                cwd: libDir,
                command: 'vitest run --config vitest.config.mts',
              },
              inputs: ['default', '^production', { externalDependencies: ['vitest'] }],
              outputs: [`{workspaceRoot}/coverage/${libDir}`],
            },
          },
        },
        null,
        2,
      ) + '\n',
  };
}

function projectGuides(libDir: string, projectName: string, tags: string[], responsibility: string): TemplateFile[] {
  const d = dots(libDir);
  return [
    {
      path: `${libDir}/AGENTS.md`,
      contents: `# ${projectName} Instructions

Follow the root [AGENTS.md](${d}AGENTS.md), [backend library rules](${d}libs/backend/AGENTS.md), and [AI agent policy](${d}docs/ai/agent-policy.md).

- Responsibility: ${responsibility}
- Keep the public API behind \`src/index.ts\`.
- Import other projects only through aliases declared in \`tsconfig.base.json\`.
- Do not move transport, domain, and persistence concerns across their generated boundaries.
- Run the local build and test targets after changes.

Nx tags: ${tags.map((tag) => `\`${tag}\``).join(', ')}.
`,
    },
    {
      path: `${libDir}/README.md`,
      contents: `# ${projectName}

${responsibility}

## Verification

\`\`\`bash
pnpm exec nx run ${projectName}:build
pnpm exec nx run ${projectName}:test
\`\`\`
`,
    },
  ];
}

function tsconfig(libDir: string): TemplateFile[] {
  const d = dots(libDir);

  // tsconfig.json — extends base, references lib + spec
  const tsconfigJson: TemplateFile = {
    path: `${libDir}/tsconfig.json`,
    contents:
      JSON.stringify(
        {
          extends: `${d}tsconfig.base.json`,
          compilerOptions: { types: ['node'] },
          include: [],
          references: [{ path: './tsconfig.lib.json' }, { path: './tsconfig.spec.json' }],
        },
        null,
        2,
      ) + '\n',
  };

  // tsconfig.lib.json — extends ./tsconfig.json, declaration: true
  const tsconfigLib: TemplateFile = {
    path: `${libDir}/tsconfig.lib.json`,
    contents:
      JSON.stringify(
        {
          extends: './tsconfig.json',
          compilerOptions: {
            outDir: `${d}dist/out-tsc/${libDir}`,
            types: ['node'],
            declaration: true,
          },
          exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
          include: ['src/**/*.ts'],
        },
        null,
        2,
      ) + '\n',
  };

  // tsconfig.spec.json
  const tsconfigSpec: TemplateFile = {
    path: `${libDir}/tsconfig.spec.json`,
    contents:
      JSON.stringify(
        {
          extends: './tsconfig.json',
          compilerOptions: {
            outDir: `${d}dist/out-tsc/${libDir}-spec`,
            types: ['node', 'vitest'],
          },
          include: ['src/**/*.spec.ts', 'src/**/*.test.ts', 'src/**/*.ts'],
        },
        null,
        2,
      ) + '\n',
  };

  // vitest.config.mts
  const vitestConfig: TemplateFile = {
    path: `${libDir}/vitest.config.mts`,
    contents: `/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { workspaceTsconfigAliases } from "${d}config/vite/workspace-tsconfig-aliases.mjs";
// nx-ignore-next-line
import { fullCoverage } from "${d}packages/tooling/src/testing/vitest-coverage.mts";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: workspaceTsconfigAliases(),
  },
  cacheDir:
    "${d}node_modules/.vitest/${libDir}",
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "coverage/${libDir}",
      ["src/**/*.ts"],
      [],
    ),
  },
});
`,
  };

  // eslint.config.cjs
  const eslintConfig: TemplateFile = {
    path: `${libDir}/eslint.config.cjs`,
    contents: `const baseConfig = require("${d}eslint.config.js");

module.exports = [
  {
    ignores: [
      "eslint.config.cjs",
      "project.json",
      "tsconfig*.json",
      "vitest.config.mts",
    ],
  },
  ...baseConfig,
  {
    languageOptions: {
      parserOptions: {
        project: "tsconfig.*?.json",
      },
    },
  },
];
`,
  };

  return [tsconfigJson, tsconfigLib, tsconfigSpec, vitestConfig, eslintConfig];
}

// ---------------------------------------------------------------------------

function createBackendTemplateFiles(
  names: ReturnType<typeof generateNames>,
  frontendRoot: string,
  migrationTimestamp: string,
): TemplateFile[] {
  const base = `libs/backend/feature/${names.kebab}`;
  const mainAlias = backendFeatureMainAlias(names);
  const sharedAlias = backendFeatureSharedAlias(names);

  return [
    // Shared library
    {
      path: `${base}/shared/lib/src/index.ts`,
      contents: `export interface ${names.pascal}Dto {
  id: string;
  name: string;
  createdAt: string;
}

export interface Create${names.pascal}Dto {
  name: string;
}

export const ${permissionReadName(names)} = "${names.kebab}:read";
export const ${permissionWriteName(names)} = "${names.kebab}:write";
`,
    },
    {
      path: `${base}/shared/lib/src/index.spec.ts`,
      contents: `import { describe, expect, it } from "vitest";
import {
  type Create${names.pascal}Dto,
  type ${names.pascal}Dto,
  ${permissionReadName(names)},
  ${permissionWriteName(names)},
} from "./index";

describe("${names.pascal}Dto", () => {
  it("exports valid read and write permission strings", () => {
    expect(${permissionReadName(names)}).toBe("${names.kebab}:read");
    expect(${permissionWriteName(names)}).toBe("${names.kebab}:write");
  });

  it("Create${names.pascal}Dto has a name property", () => {
    const dto: Create${names.pascal}Dto = { name: "test" };
    expect(dto.name).toBe("test");
  });

  it("${names.pascal}Dto has all required fields", () => {
    const dto: ${names.pascal}Dto = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      name: "Example",
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    expect(dto.id).toBe("123e4567-e89b-12d3-a456-426614174000");
    expect(dto.name).toBe("Example");
    expect(dto.createdAt).toBe("2024-01-01T00:00:00.000Z");
  });
});
`,
    },
    projectJson(`${base}/shared/lib`, sharedAlias, `${base}/shared/lib/src`, `dist/${base}/shared`, [
      'platform:backend',
      'type:feature-shared',
      `scope:${names.kebab}`,
    ]),
    ...tsconfig(`${base}/shared/lib`),
    ...projectGuides(
      `${base}/shared/lib`,
      sharedAlias,
      ['platform:backend', 'type:feature-shared', `scope:${names.kebab}`],
      `Stable ${names.title} DTOs and permission contracts shared by backend adapters.`,
    ),

    // Main library
    {
      path: `${base}/main/lib/src/index.ts`,
      contents: `export * from "./${names.kebab}.module";\nexport * from "./${names.kebab}.controller";\nexport * from "./${names.kebab}.service";\nexport * from "${sharedAlias}";\n`,
    },
    {
      path: `${base}/main/lib/src/${names.kebab}.module.ts`,
      contents: `import { Module } from "@nestjs/common";\nimport { ${names.pascal}PostgresModule } from "${backendPostgresMainAlias(names)}";\nimport { ${names.pascal}Controller } from "./${names.kebab}.controller";\nimport { ${names.pascal}Service } from "./${names.kebab}.service";\n\n@Module({\n  imports: [${names.pascal}PostgresModule],\n  controllers: [${names.pascal}Controller],\n  providers: [${names.pascal}Service],\n  exports: [${names.pascal}Service],\n})\nexport class ${names.pascal}Module {}\n`,
    },
    {
      path: `${base}/main/lib/src/${names.kebab}.service.ts`,
      contents: `import { Inject, Injectable } from "@nestjs/common";\nimport { InternalException } from "@app/backend-common-exception";\nimport { ${names.pascal}Repository } from "${backendPostgresMainAlias(names)}";\nimport type { Create${names.pascal}Dto, ${names.pascal}Dto } from "${sharedAlias}";\n\n@Injectable()\nexport class ${names.pascal}Service {\n  constructor(\n    @Inject(${names.pascal}Repository)\n    private readonly repository: ${names.pascal}Repository,\n  ) {}\n\n  async list(): Promise<${names.pascal}Dto[]> {\n    const result = await this.repository.list();\n    if (result.isErr()) throw new InternalException({ feature: "${names.kebab}", operation: "list" });\n    return result.value.map(toDto);\n  }\n\n  async create(input: Create${names.pascal}Dto): Promise<${names.pascal}Dto> {\n    const result = await this.repository.create(input.name);\n    if (result.isErr()) throw new InternalException({ feature: "${names.kebab}", operation: "create" });\n    return toDto(result.value);\n  }\n}\n\nfunction toDto(entity: { id: string; name: string; createdAt: Date }): ${names.pascal}Dto {\n  return { id: entity.id, name: entity.name, createdAt: entity.createdAt.toISOString() };\n}\n`,
    },
    {
      path: `${base}/main/lib/src/${names.kebab}.controller.ts`,
      contents: `import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";\nimport { ApiBearerAuth, ApiProperty } from "@nestjs/swagger";\nimport { IsString, Length } from "class-validator";\nimport { ApiOkDataResponse, ApiExceptions, ApiSessionCookieAuth } from "@app/backend-common-swagger";\nimport { createOkResponse, type OkResponse } from "@app/backend-common-response";\nimport { RbacGuard, SessionAuthGuard, RequirePermissions } from "@app/backend-feature-auth-shared";\nimport { ${permissionReadName(names)}, ${permissionWriteName(names)}, type Create${names.pascal}Dto, type ${names.pascal}Dto } from "${sharedAlias}";\nimport { ${names.pascal}Service } from "./${names.kebab}.service";\n\nclass Create${names.pascal}BodyDto implements Create${names.pascal}Dto {\n  @ApiProperty({ minLength: 1, maxLength: 255 })\n  @IsString()\n  @Length(1, 255)\n  name!: string;\n}\n\nclass ${names.pascal}ResponseDto implements ${names.pascal}Dto {\n  @ApiProperty({ format: "uuid" })\n  id!: string;\n\n  @ApiProperty()\n  name!: string;\n\n  @ApiProperty({ format: "date-time" })\n  createdAt!: string;\n}\n\n@ApiExceptions(400, 401, 403, 429, 500)\n@ApiBearerAuth()\n@ApiSessionCookieAuth()\n@Controller("${names.kebab}")\n@UseGuards(new SessionAuthGuard(), new RbacGuard())\nexport class ${names.pascal}Controller {\n  constructor(private readonly ${names.camel}Service: ${names.pascal}Service) {}\n\n  @Get()\n  @RequirePermissions(${permissionReadName(names)})\n  @ApiOkDataResponse(${names.pascal}ResponseDto)\n  async list(): Promise<OkResponse<${names.pascal}Dto[]>> {\n    return createOkResponse(await this.${names.camel}Service.list());\n  }\n\n  @Post()\n  @RequirePermissions(${permissionWriteName(names)})\n  @ApiOkDataResponse(${names.pascal}ResponseDto)\n  async create(\n    @Body() input: Create${names.pascal}BodyDto,\n  ): Promise<OkResponse<${names.pascal}Dto>> {\n    return createOkResponse(await this.${names.camel}Service.create(input));\n  }\n}\n`,
    },
    {
      path: `${base}/main/lib/src/${names.kebab}.service.spec.ts`,
      contents: `import { okAsync } from "neverthrow";\nimport { describe, expect, it } from "vitest";\nimport { ${names.pascal}Entity } from "${backendPostgresMainAlias(names)}";\nimport { ${names.pascal}Service } from "./${names.kebab}.service";\n\ndescribe("${names.pascal}Service", () => {\n  it("persists and maps a ${names.title.toLowerCase()}", async () => {\n    const entity = new ${names.pascal}Entity({ name: "Example" });\n    const repository = { list: () => okAsync([entity]), create: () => okAsync(entity) };\n    const service = new ${names.pascal}Service(repository as never);\n    await expect(service.create({ name: "Example" })).resolves.toMatchObject({ name: "Example" });\n  });\n});\n`,
    },
    projectJson(`${base}/main/lib`, mainAlias, `${base}/main/lib/src`, `dist/${base}/main`, [
      'platform:backend',
      'type:feature-main',
      `scope:${names.kebab}`,
    ]),
    ...tsconfig(`${base}/main/lib`),
    ...projectGuides(
      `${base}/main/lib`,
      mainAlias,
      ['platform:backend', 'type:feature-main', `scope:${names.kebab}`],
      `${names.title} application orchestration and HTTP transport.`,
    ),

    // Postgres data access
    {
      path: `libs/backend/postgres/main/${names.kebab}/lib/src/index.ts`,
      contents: `export * from "./${names.kebab}-postgres.module";\nexport * from "./infrastructure/data-access";\n`,
    },
    {
      path: `libs/backend/postgres/main/${names.kebab}/lib/src/${names.kebab}-postgres.module.ts`,
      contents: `import { MikroOrmModule } from "@mikro-orm/nestjs";\nimport { Module } from "@nestjs/common";\nimport { ${names.pascal}EntitySchema } from "./infrastructure/data-access/entities";\nimport { ${names.pascal}Repository } from "./infrastructure/data-access/repositories";\n\n@Module({\n  imports: [MikroOrmModule.forFeature([${names.pascal}EntitySchema])],\n  providers: [${names.pascal}Repository],\n  exports: [MikroOrmModule, ${names.pascal}Repository],\n})\nexport class ${names.pascal}PostgresModule {}\n`,
    },
    {
      path: `libs/backend/postgres/main/${names.kebab}/lib/src/infrastructure/data-access/index.ts`,
      contents: `export * from "./entities";\nexport * from "./repositories";\nexport * from "./migrations";\n`,
    },
    {
      path: `libs/backend/postgres/main/${names.kebab}/lib/src/infrastructure/data-access/entities/${names.kebab}.entity.ts`,
      contents: `import { randomUUID } from "node:crypto";\nimport { EntitySchema } from "@mikro-orm/core";\n\nexport interface ${names.pascal}EntityInput {\n  name: string;\n}\n\nexport class ${names.pascal}Entity {\n  id: string = randomUUID();\n  name!: string;\n  createdAt: Date = new Date();\n\n  constructor(input?: ${names.pascal}EntityInput) {\n    if (input) {\n      this.name = input.name;\n    }\n  }\n}\n\nexport const ${names.pascal}EntitySchema = new EntitySchema<${names.pascal}Entity>({\n  class: ${names.pascal}Entity,\n  tableName: "${names.kebab.replaceAll('-', '_')}",\n  properties: {\n    id: { type: "uuid", primary: true },\n    name: { type: "varchar", length: 255 },\n    createdAt: {\n      type: "timestamptz",\n      fieldName: "created_at",\n      onCreate: () => new Date(),\n    },\n  },\n});\n`,
    },
    {
      path: `libs/backend/postgres/main/${names.kebab}/lib/src/infrastructure/data-access/entities/index.ts`,
      contents: `export * from "./${names.kebab}.entity";\n`,
    },
    {
      path: `libs/backend/postgres/main/${names.kebab}/lib/src/infrastructure/data-access/repositories/${names.kebab}.repository.ts`,
      contents: `import { EntityManager } from "@mikro-orm/core";\nimport { Inject, Injectable } from "@nestjs/common";\nimport { ResultAsync } from "neverthrow";\nimport { ${names.pascal}Entity } from "../entities";\n\nexport interface ${names.pascal}RepositoryError { code: "repository_error"; }\n\n@Injectable()\nexport class ${names.pascal}Repository {\n  constructor(\n    @Inject(EntityManager)\n    private readonly entityManager: EntityManager,\n  ) {}\n\n  list(): ResultAsync<${names.pascal}Entity[], ${names.pascal}RepositoryError> {\n    return ResultAsync.fromPromise(\n      this.entityManager.find(${names.pascal}Entity, {}, { orderBy: { createdAt: "DESC" } }),\n      () => ({ code: "repository_error" as const }),\n    );\n  }\n\n  create(name: string): ResultAsync<${names.pascal}Entity, ${names.pascal}RepositoryError> {\n    return ResultAsync.fromPromise(this.persist(name), () => ({ code: "repository_error" as const }));\n  }\n\n  private async persist(name: string): Promise<${names.pascal}Entity> {\n    const entity = new ${names.pascal}Entity({ name });\n    this.entityManager.persist(entity);\n    await this.entityManager.flush();\n    return entity;\n  }\n}\n`,
    },
    {
      path: `libs/backend/postgres/main/${names.kebab}/lib/src/infrastructure/data-access/repositories/index.ts`,
      contents: `export * from "./${names.kebab}.repository";\n`,
    },
    {
      path: `libs/backend/postgres/main/${names.kebab}/lib/src/infrastructure/data-access/migrations/Migration${migrationTimestamp}Create${names.pascal}.ts`,
      contents: `import { Migration } from "@mikro-orm/migrations";\n\nexport class Migration${migrationTimestamp}Create${names.pascal} extends Migration {\n  override up(): void {\n    this.addSql('create table "${names.kebab.replaceAll('-', '_')}" ("id" uuid not null, "name" varchar(255) not null, "created_at" timestamptz not null, constraint "${names.kebab.replaceAll('-', '_')}_pkey" primary key ("id"));');\n  }\n\n  override down(): void {\n    this.addSql('drop table if exists "${names.kebab.replaceAll('-', '_')}" cascade;');\n  }\n}\n`,
    },
    {
      path: `libs/backend/postgres/main/${names.kebab}/lib/src/infrastructure/data-access/migrations/Migration${migrationTimestamp}Create${names.pascal}.spec.ts`,
      contents: `import { describe, expect, it } from "vitest";
import { Migration${migrationTimestamp}Create${names.pascal} } from "./Migration${migrationTimestamp}Create${names.pascal}";

describe("Migration${migrationTimestamp}Create${names.pascal}", () => {
  it("up() generates CREATE TABLE SQL with required columns", () => {
    const migration = new Migration${migrationTimestamp}Create${names.pascal}();
    const sql: string[] = [];
    migration.addSql = (query: string) => {
      sql.push(query);
    };

    migration.up();

    const joined = sql.join("\\n");
    expect(joined).toContain("create table");
    expect(joined).toContain("${names.kebab.replaceAll('-', '_')}");
    expect(joined).toContain('"id"');
    expect(joined).toContain('"name"');
    expect(joined).toContain('"created_at"');
    expect(joined).toContain("primary key");
  });

  it("down() generates DROP TABLE SQL", () => {
    const migration = new Migration${migrationTimestamp}Create${names.pascal}();
    const sql: string[] = [];
    migration.addSql = (query: string) => {
      sql.push(query);
    };

    migration.up();
    migration.down();

    const joined = sql.join("\\n");
    expect(joined).toContain("drop table");
    expect(joined).toContain("${names.kebab.replaceAll('-', '_')}");
    expect(joined).toContain("cascade");
  });
});
`,
    },
    {
      path: `libs/backend/postgres/main/${names.kebab}/lib/src/infrastructure/data-access/migrations/index.ts`,
      contents: `export * from "./Migration${migrationTimestamp}Create${names.pascal}";\n`,
    },
    projectJson(
      `libs/backend/postgres/main/${names.kebab}/lib`,
      backendPostgresMainAlias(names),
      `libs/backend/postgres/main/${names.kebab}/lib/src`,
      `dist/libs/backend/postgres/main/${names.kebab}`,
      ['platform:backend', 'type:data-access', `scope:${names.kebab}`],
    ),
    ...tsconfig(`libs/backend/postgres/main/${names.kebab}/lib`),
    ...projectGuides(
      `libs/backend/postgres/main/${names.kebab}/lib`,
      backendPostgresMainAlias(names),
      ['platform:backend', 'type:data-access', `scope:${names.kebab}`],
      `${names.title} PostgreSQL entities, repository, and migrations.`,
    ),

    // The OpenAPI contract and generated API clients remain generated artifacts.
    // This feature-facing page accepts translated copy and can consume the
    // regenerated client after `pnpm api:contracts && pnpm api:clients`.
    {
      path: `${frontendRoot}/src/pages/${names.kebab}/ui/${names.pascal}Page.tsx`,
      contents: `export interface ${names.pascal}PageProps {\n  title: string;\n  description?: string;\n}\n\nexport function ${names.pascal}Page({ title, description }: ${names.pascal}PageProps) {\n  return (\n    <main>\n      <h1>{title}</h1>\n      {description ? <p>{description}</p> : null}\n    </main>\n  );\n}\n`,
    },
    {
      path: `${frontendRoot}/src/pages/${names.kebab}/index.ts`,
      contents: `export * from "./ui/${names.pascal}Page";\n`,
    },
    {
      path: `docs/features/${names.kebab}/scaffold.md`,
      contents: `# ${names.title} scaffold\n\nThe backend route, persistence module, migration, and frontend page boundary are generated.\n\n## Finish the product flow\n\n1. Run \`pnpm api:contracts\` and \`pnpm api:clients\` after the API compiles.\n2. Add a frontend API wrapper that imports only \`@app/frontend-api-client\`.\n3. Register the page in the owning application router with translated copy.\n4. Add component and e2e coverage for loading, error, empty, success, auth, and RBAC states.\n`,
    },
  ];
}

// ---------------------------------------------------------------------------

function createTsconfigAliases(names: ReturnType<typeof generateNames>): Record<string, string[]> {
  return {
    [backendFeatureMainAlias(names)]: [`libs/backend/feature/${names.kebab}/main/lib/src/index.ts`],
    [backendFeatureSharedAlias(names)]: [`libs/backend/feature/${names.kebab}/shared/lib/src/index.ts`],
    [backendPostgresMainAlias(names)]: [`libs/backend/postgres/main/${names.kebab}/lib/src/index.ts`],
  };
}

function findExistingTsconfigAliases(tree: Tree, names: ReturnType<typeof generateNames>): string[] {
  const tsconfig = readJsonFile(tree, 'tsconfig.base.json');
  const compilerOptions = tsconfig?.compilerOptions as { paths?: Record<string, string[]> } | undefined;
  const paths = compilerOptions?.paths ?? {};
  const newAliases = createTsconfigAliases(names);
  return Object.keys(newAliases).filter((alias) => Object.prototype.hasOwnProperty.call(paths, alias));
}

function findExistingFiles(tree: Tree, files: TemplateFile[]): string[] {
  return files.filter((f) => tree.exists(f.path)).map((f) => f.path);
}

function listApiApps(tree: Tree): string[] {
  const projects = getProjects(tree);
  const apiApps: string[] = [];
  for (const [name, config] of projects.entries()) {
    if (config.root?.startsWith('apps/backend/') && config.tags?.includes('type:backend-app')) {
      apiApps.push(name);
    }
  }
  return apiApps.sort();
}

function listFrontendApps(tree: Tree): string[] {
  const projects = getProjects(tree);
  const frontendApps: string[] = [];
  for (const [name, config] of projects.entries()) {
    if (config.root?.startsWith('apps/frontend/') && config.tags?.includes('type:frontend-app')) {
      frontendApps.push(name);
    }
  }
  return frontendApps.sort();
}

function projectRoot(tree: Tree, projectName: string): string | undefined {
  return getProjects(tree).get(projectName)?.root;
}

function defaultMigrationTimestamp(): string {
  return new Date().toISOString().replaceAll(/\D/g, '').slice(0, 14);
}

function wireApiModule(tree: Tree, apiApp: string, names: ReturnType<typeof generateNames>, dryRun: boolean): void {
  const root = projectRoot(tree, apiApp);
  if (!root) {
    return;
  }

  const modulePath = `${root}/src/${apiApp}.module.ts`;
  const contents = tree.read(modulePath, 'utf8');
  if (!contents) {
    throw new Error(`Cannot wire ${backendFeatureMainAlias(names)}: expected API module at ${modulePath}.`);
  }

  const moduleName = `${names.pascal}Module`;
  if (contents.includes(`import { ${moduleName} } from "${backendFeatureMainAlias(names)}"`)) {
    return;
  }
  if (!/imports:\s*\[/.test(contents)) {
    throw new Error(`Cannot wire ${backendFeatureMainAlias(names)}: ${modulePath} has no @Module imports array.`);
  }

  if (dryRun) {
    console.log(`UPDATE ${modulePath} import ${moduleName}`);
    return;
  }

  const importLine = `import { ${moduleName} } from "${backendFeatureMainAlias(names)}";\n`;
  const updated = `${importLine}${contents}`.replace(/imports:\s*\[/, (match) => `${match}${moduleName}, `);
  tree.write(modulePath, updated);
}

// ---------------------------------------------------------------------------

export interface FeatureGeneratorOptions {
  name: string;
  apiApp?: string;
  frontendApp?: string;
  migrationTimestamp?: string | number;
  force?: boolean;
  dryRun?: boolean;
  skipFormat?: boolean;
}

export async function featureGenerator(tree: Tree, options: FeatureGeneratorOptions): Promise<void> {
  const nameError = validateName(options.name);
  if (nameError) {
    throw new Error(nameError);
  }

  const names = generateNames(options.name);
  const apiApp = options.apiApp ?? 'user-app-api';
  const frontendApp = options.frontendApp ?? 'user-app';
  const migrationTimestamp = String(options.migrationTimestamp ?? defaultMigrationTimestamp());
  if (!/^\d{14}$/.test(migrationTimestamp)) {
    throw new Error('--migration-timestamp must contain exactly 14 digits (YYYYMMDDHHmmss).');
  }

  const validApiApps = listApiApps(tree);
  if (validApiApps.length > 0 && !validApiApps.includes(apiApp)) {
    throw new Error(
      `Invalid --api-app "${apiApp}". Expected one of: ${validApiApps.join(', ') || '(none found under apps/backend)'}.`,
    );
  }

  const validFrontendApps = listFrontendApps(tree);
  if (validFrontendApps.length > 0 && !validFrontendApps.includes(frontendApp)) {
    throw new Error(`Invalid --frontend-app "${frontendApp}". Expected one of: ${validFrontendApps.join(', ')}.`);
  }
  const frontendRoot = projectRoot(tree, frontendApp) ?? 'apps/frontend/app';

  const files = createBackendTemplateFiles(names, frontendRoot, migrationTimestamp);

  if (!options.force) {
    const existingFiles = findExistingFiles(tree, files);
    const existingAliases = findExistingTsconfigAliases(tree, names);
    if (existingFiles.length > 0 || existingAliases.length > 0) {
      const conflicts: string[] = [];
      for (const p of existingFiles) {
        conflicts.push(`File exists: ${p}`);
      }
      for (const a of existingAliases) {
        conflicts.push(`Tsconfig alias exists: ${a}`);
      }
      throw new Error(`Refusing to overwrite existing files or aliases. Re-run with --force:\n${conflicts.join('\n')}`);
    }
  }

  for (const file of files) {
    if (options.dryRun) {
      console.log(`CREATE ${file.path}`);
    } else {
      tree.write(file.path, file.contents);
    }
  }

  if (!options.dryRun) {
    const tsconfig = readJsonFile(tree, 'tsconfig.base.json');
    if (tsconfig) {
      const compilerOptions = (tsconfig.compilerOptions ?? {}) as Record<string, unknown>;
      const paths = (compilerOptions.paths ?? {}) as Record<string, string[]>;
      const newAliases = createTsconfigAliases(names);
      compilerOptions.paths = { ...paths, ...newAliases };
      writeJsonFile(tree, 'tsconfig.base.json', tsconfig);
    }
  } else {
    console.log('UPDATE tsconfig.base.json path aliases');
  }

  wireApiModule(tree, apiApp, names, options.dryRun === true);

  if (options.dryRun) {
    console.log('');
    console.log('Next steps:');
    console.log(`1. Compile ${apiApp}; the generator wires ${backendFeatureMainAlias(names)} into its module.`);
    console.log('2. Run pnpm api:contracts && pnpm api:clients to regenerate API artifacts.');
    console.log(`3. Register the generated page in ${frontendApp} with translated copy and the generated client.`);
    console.log('4. Run pnpm run check and the owning app/API e2e targets.');
  }

  if (!options.skipFormat && !options.dryRun) {
    await formatFiles(tree);
  }
}

export default featureGenerator;
