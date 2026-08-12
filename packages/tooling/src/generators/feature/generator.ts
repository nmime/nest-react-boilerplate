// Evidence for: REQ-SCAFFOLD-GENERATORS-003
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
import { findAdjacentOwner, generatedRequirementId, generateNames, validateName } from '../names.ts';
import { readJsonFile, writeJsonFile } from '../../setup/adapters/nx-tree.ts';

// ---------------------------------------------------------------------------

interface TemplateFile {
  path: string;
  contents: string;
}

type DatabaseProvider = 'postgres' | 'mongodb';
const productionMigrationRunnerPath = 'packages/tooling/src/commands/db/orm-migration-config.ts';
const productionMigrationImportName = 'createPostgresMikroOrmOptions';
const productionMigrationImportPath = 'libs/backend/postgres/main/shared/lib/src/data-source-options.ts';
const productionMigrationListPattern = /migrationsList:\s*\[([\s\S]*?)\](?=\s*,)/gu;

/**
 * Coverage exclusions every scaffolded library ships with.
 *
 * `fullCoverage` demands 100% on every metric, so a scaffold that measures files no generated
 * spec can meaningfully execute fails its own gate the first time a consumer runs `--coverage`.
 * That taught the first lesson of the repo as "edit the generated config", and every consumer
 * then invented its own exclusion vocabulary. These are the ones the boilerplate's own feature
 * libraries already use: Nest module declarations and DTO shape declarations carry no behaviour
 * a spec can assert. Everything else the generator emits gets a generated spec instead.
 */
const scaffoldCoverageExclusions = ['src/**/*.module.ts', 'src/**/*.dto.ts'];

/**
 * Libraries whose `index.ts` files are pure re-export barrels also exclude them. The shared
 * library is the exception: its `index.ts` IS the DTO and permission contract, and it has a spec.
 */
const barrelCoverageExclusions = ['src/**/index.ts', ...scaffoldCoverageExclusions];

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

function backendMongoMainAlias(names: ReturnType<typeof generateNames>): string {
  return `@app/backend-mongodb-main-${names.kebab}`;
}

function backendDatabaseMainAlias(names: ReturnType<typeof generateNames>, database: DatabaseProvider): string {
  return database === 'postgres' ? backendPostgresMainAlias(names) : backendMongoMainAlias(names);
}

function databaseRoot(names: ReturnType<typeof generateNames>, database: DatabaseProvider): string {
  return `libs/backend/${database}/main/${names.kebab}/lib`;
}

function permissionReadName(names: ReturnType<typeof generateNames>): string {
  return names.pascal + 'ReadPermission';
}

function permissionWriteName(names: ReturnType<typeof generateNames>): string {
  return names.pascal + 'WritePermission';
}

function migrationsName(names: ReturnType<typeof generateNames>): string {
  return `${names.camel}Migrations`;
}

/**
 * The service spec covers `list`, `create`, and both repository-failure branches, because those
 * are every branch the generated service has. A scaffold whose specs stop at the happy path
 * cannot pass the coverage gate it also scaffolds.
 */
function serviceSpecContents(
  names: ReturnType<typeof generateNames>,
  database: DatabaseProvider,
  requirementId: string,
): string {
  const entityImport =
    database === 'postgres'
      ? `import { ${names.pascal}Entity } from "${backendPostgresMainAlias(names)}";`
      : `import type { ${names.pascal}Entity } from "${backendMongoMainAlias(names)}";`;
  const entityValue =
    database === 'postgres'
      ? `new ${names.pascal}Entity({ name: "Example" })`
      : `{ id: "123e4567-e89b-12d3-a456-426614174000", name: "Example", createdAt: new Date() }`;
  const entityDeclaration =
    database === 'postgres'
      ? `const entity = ${entityValue};`
      : `const entity: ${names.pascal}Entity = ${entityValue};`;

  return `// @requirements ${requirementId}
import { errAsync, okAsync } from "neverthrow";
import { describe, expect, it } from "vitest";
${entityImport}
import { ${names.pascal}Service } from "./${names.kebab}.service";

${entityDeclaration}
const failure = { code: "repository_error" as const };

function serviceWith(repository: unknown): ${names.pascal}Service {
  return new ${names.pascal}Service(repository as never);
}

describe("${names.pascal}Service", () => {
  it("persists and maps a ${names.title.toLowerCase()}", async () => {
    const service = serviceWith({ list: () => okAsync([entity]), create: () => okAsync(entity) });
    await expect(service.create({ name: "Example" })).resolves.toMatchObject({ name: "Example" });
  });

  it("lists and maps every stored ${names.title.toLowerCase()}", async () => {
    const service = serviceWith({ list: () => okAsync([entity]), create: () => okAsync(entity) });
    await expect(service.list()).resolves.toMatchObject([{ name: "Example" }]);
  });

  it("raises an internal exception when the repository cannot read", async () => {
    const service = serviceWith({ list: () => errAsync(failure), create: () => okAsync(entity) });
    await expect(service.list()).rejects.toThrow();
  });

  it("raises an internal exception when the repository cannot write", async () => {
    const service = serviceWith({ list: () => okAsync([entity]), create: () => errAsync(failure) });
    await expect(service.create({ name: "Example" })).rejects.toThrow();
  });
});
`;
}

/** The controller is HTTP transport, so its spec asserts the envelope both routes must produce. */
function controllerSpecContents(names: ReturnType<typeof generateNames>, requirementId: string): string {
  return `// @requirements ${requirementId}
import { describe, expect, it } from "vitest";
import type { ${names.pascal}Dto } from "${backendFeatureSharedAlias(names)}";
import { ${names.pascal}Controller } from "./${names.kebab}.controller";

const dto: ${names.pascal}Dto = {
  id: "123e4567-e89b-12d3-a456-426614174000",
  name: "Example",
  createdAt: "2024-01-01T00:00:00.000Z",
};

function controllerWith(service: unknown): ${names.pascal}Controller {
  return new ${names.pascal}Controller(service as never);
}

describe("${names.pascal}Controller", () => {
  it("wraps the listed ${names.title.toLowerCase()} in an ok envelope", async () => {
    const controller = controllerWith({ list: async () => [dto], create: async () => dto });
    await expect(controller.list()).resolves.toEqual({ data: [dto] });
  });

  it("wraps the created ${names.title.toLowerCase()} in an ok envelope", async () => {
    const controller = controllerWith({ list: async () => [dto], create: async () => dto });
    await expect(controller.create({ name: "Example" })).resolves.toEqual({ data: dto });
  });
});
`;
}

/** The entity carries a constructor and an `onCreate` hook, both of which the gate measures. */
function postgresEntitySpecContents(names: ReturnType<typeof generateNames>, requirementId: string): string {
  const tableName = names.kebab.replaceAll('-', '_');
  return `// @requirements ${requirementId}
import { describe, expect, it } from "vitest";
import { ${names.pascal}Entity, ${names.pascal}EntitySchema } from "./${names.kebab}.entity";

describe("${names.pascal}Entity", () => {
  it("assigns an identifier and creation timestamp on construction", () => {
    const entity = new ${names.pascal}Entity({ name: "Example" });

    expect(entity.name).toBe("Example");
    expect(entity.id).toMatch(/^[0-9a-f-]{36}$/u);
    expect(entity.createdAt).toBeInstanceOf(Date);
  });

  it("leaves the name unset when constructed without input", () => {
    expect(new ${names.pascal}Entity().name).toBeUndefined();
  });

  it("maps to the ${tableName} table and stamps createdAt on insert", () => {
    expect(${names.pascal}EntitySchema.meta.tableName).toBe("${tableName}");
    expect(${names.pascal}EntitySchema.meta.properties.createdAt?.onCreate?.({} as never, {} as never)).toBeInstanceOf(
      Date,
    );
  });
});
`;
}

/** Both repository methods have a success and a failure path; a fake EntityManager drives all four. */
function postgresRepositorySpecContents(names: ReturnType<typeof generateNames>, requirementId: string): string {
  return `// @requirements ${requirementId}
import { describe, expect, it } from "vitest";
import { ${names.pascal}Entity } from "../entities";
import { ${names.pascal}Repository } from "./${names.kebab}.repository";

function repositoryWith(entityManager: unknown): ${names.pascal}Repository {
  return new ${names.pascal}Repository(entityManager as never);
}

describe("${names.pascal}Repository", () => {
  it("lists newest first", async () => {
    const entity = new ${names.pascal}Entity({ name: "Example" });
    const repository = repositoryWith({ find: async () => [entity] });

    const result = await repository.list();

    expect(result._unsafeUnwrap()).toEqual([entity]);
  });

  it("reports a repository error when the read fails", async () => {
    const repository = repositoryWith({
      find: async () => {
        throw new Error("unavailable");
      },
    });

    expect((await repository.list())._unsafeUnwrapErr()).toEqual({ code: "repository_error" });
  });

  it("persists and flushes a new ${names.title.toLowerCase()}", async () => {
    const persisted: unknown[] = [];
    const repository = repositoryWith({
      persist: (entity: unknown) => persisted.push(entity),
      flush: async () => undefined,
    });

    const result = await repository.create("Example");

    expect(result._unsafeUnwrap().name).toBe("Example");
    expect(persisted).toHaveLength(1);
  });

  it("reports a repository error when the flush fails", async () => {
    const repository = repositoryWith({
      persist: () => undefined,
      flush: async () => {
        throw new Error("unavailable");
      },
    });

    expect((await repository.create("Example"))._unsafeUnwrapErr()).toEqual({ code: "repository_error" });
  });
});
`;
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

function mongoProjectJson(
  libDir: string,
  name: string,
  sourceRoot: string,
  outputPath: string,
  tags: string[],
): TemplateFile {
  const file = projectJson(libDir, name, sourceRoot, outputPath, tags);
  const project = JSON.parse(file.contents) as {
    targets: Record<string, unknown>;
  };
  project.targets['component-test'] = {
    executor: 'nx:run-commands',
    cache: false,
    options: {
      cwd: libDir,
      command: 'NODE_ENV=test vitest run --config vitest.component.config.mts',
    },
    inputs: [
      'default',
      '^production',
      { externalDependencies: ['vitest', 'mongodb', 'testcontainers', '@testcontainers/mongodb'] },
    ],
    outputs: [`{workspaceRoot}/coverage/${libDir}-component`],
  };
  return { ...file, contents: `${JSON.stringify(project, null, 2)}\n` };
}

function mongoComponentTestConfig(libDir: string): TemplateFile {
  const d = dots(libDir);
  return {
    path: `${libDir}/vitest.component.config.mts`,
    contents: `/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { workspaceTsconfigAliases } from "${d}config/vite/workspace-tsconfig-aliases.mjs";
// nx-ignore-next-line
import { workspaceCoverageDirectory } from "${d}packages/tooling/src/testing/vitest-coverage.mts";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: workspaceTsconfigAliases(),
  },
  cacheDir: "${d}node_modules/.vitest/${libDir}-component",
  test: {
    environment: "node",
    include: ["src/**/*.component-spec.ts"],
    globals: false,
    hookTimeout: 180_000,
    testTimeout: 180_000,
    coverage: {
      enabled: false,
      provider: "v8",
      reportsDirectory: workspaceCoverageDirectory("coverage/${libDir}-component"),
      reporter: ["text", "lcov"],
      exclude: ["src/**/*.component-spec.ts"],
    },
  },
});
`,
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

## Purpose

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

function tsconfig(libDir: string, coverageExclusions: string[] = barrelCoverageExclusions): TemplateFile[] {
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
      ${JSON.stringify(coverageExclusions)},
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

function createMongoDataAccessTemplateFiles(
  names: ReturnType<typeof generateNames>,
  migrationTimestamp: string,
): TemplateFile[] {
  const libDir = databaseRoot(names, 'mongodb');
  const sourceRoot = `${libDir}/src`;
  const alias = backendMongoMainAlias(names);
  const collectionName = names.kebab.replaceAll('-', '_');
  const indexName = `ix__${collectionName}__created_at_id`;

  return [
    {
      path: `${sourceRoot}/index.ts`,
      contents: `export * from "./${names.kebab}-mongo.collection";\nexport * from "./${names.kebab}-mongo.module";\nexport * from "./${names.kebab}-mongo.repository";\nexport * from "./${names.kebab}-mongo.types";\nexport * from "./migrations";\n`,
    },
    {
      path: `${sourceRoot}/${names.kebab}-mongo.types.ts`,
      contents: `export interface ${names.pascal}Document {
  _id: string;
  name: string;
  createdAt: Date;
}

export interface ${names.pascal}Entity {
  id: string;
  name: string;
  createdAt: Date;
}

export interface ${names.pascal}RepositoryError {
  code: "repository_error";
}
`,
    },
    {
      path: `${sourceRoot}/${names.kebab}-mongo.collection.ts`,
      contents: `import type { CreateIndexesOptions, Db, IndexDescription } from "mongodb";
// eslint-disable-next-line @nx/enforce-module-boundaries
import { assertCollectionDefinition } from "../../../shared/lib/src/migrations/mongo-migration";
import type { ${names.pascal}Document } from "./${names.kebab}-mongo.types";

export const ${names.pascal}CollectionName = "${collectionName}";
export const ${names.pascal}CreatedAtIndexName = "${indexName}";

export const ${names.pascal}CollectionValidator = {
  $jsonSchema: {
    bsonType: "object",
    additionalProperties: false,
    required: ["_id", "name", "createdAt"],
    properties: {
      _id: { bsonType: "string" },
      name: { bsonType: "string", minLength: 1, maxLength: 255 },
      createdAt: { bsonType: "date" },
    },
  },
} as const;

export const ${names.pascal}Indexes: Array<IndexDescription & CreateIndexesOptions> = [
  { name: ${names.pascal}CreatedAtIndexName, key: { createdAt: -1, _id: 1 } },
];

export async function initialize${names.pascal}Collection(database: Db): Promise<void> {
  let existed = false;
  try {
    await database.createCollection<${names.pascal}Document>(${names.pascal}CollectionName, {
      validator: ${names.pascal}CollectionValidator,
      validationAction: "error",
      validationLevel: "strict",
    });
  } catch (error) {
    if (!isNamespaceExistsError(error)) throw error;
    existed = true;
  }

  if (existed) {
    await database.command({
      collMod: ${names.pascal}CollectionName,
      validator: ${names.pascal}CollectionValidator,
      validationAction: "error",
      validationLevel: "strict",
    });
  }
  await database.collection<${names.pascal}Document>(${names.pascal}CollectionName).createIndexes(${names.pascal}Indexes);
}

export async function verify${names.pascal}Collection(database: Db): Promise<void> {
  await assertCollectionDefinition(database, {
    name: ${names.pascal}CollectionName,
    validator: ${names.pascal}CollectionValidator,
    indexes: ${names.pascal}Indexes,
  });
}

function isNamespaceExistsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 48;
}
`,
    },
    {
      path: `${sourceRoot}/${names.kebab}-mongo.repository.ts`,
      contents: `import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { MongoClientToken, MongoDatabaseToken, runInMongoTransaction } from "@app/backend-mongodb-main";
import type { ClientSession, Collection, Db, MongoClient } from "mongodb";
import { ResultAsync } from "neverthrow";
import { ${names.pascal}CollectionName } from "./${names.kebab}-mongo.collection";
import type { ${names.pascal}Document, ${names.pascal}Entity, ${names.pascal}RepositoryError } from "./${names.kebab}-mongo.types";

@Injectable()
export class ${names.pascal}Repository {
  private readonly collection: Collection<${names.pascal}Document>;

  constructor(
    @Inject(MongoDatabaseToken) database: Db,
    @Inject(MongoClientToken) private readonly client: MongoClient,
  ) {
    this.collection = database.collection<${names.pascal}Document>(${names.pascal}CollectionName);
  }

  list(): ResultAsync<${names.pascal}Entity[], ${names.pascal}RepositoryError> {
    return ResultAsync.fromPromise(
      this.collection.find().sort({ createdAt: -1, _id: 1 }).toArray().then((documents) => documents.map(toEntity)),
      mapRepositoryError,
    );
  }

  create(name: string): ResultAsync<${names.pascal}Entity, ${names.pascal}RepositoryError> {
    return ResultAsync.fromPromise(
      this.persistMany([name]).then((entities) => entities[0]!),
      mapRepositoryError,
    );
  }

  createMany(names: readonly string[]): ResultAsync<${names.pascal}Entity[], ${names.pascal}RepositoryError> {
    return ResultAsync.fromPromise(this.persistMany(names), mapRepositoryError);
  }

  private async persistMany(names: readonly string[]): Promise<${names.pascal}Entity[]> {
    if (names.length === 0) return [];
    return runInMongoTransaction(this.client, async (session: ClientSession) => {
      const createdAt = new Date();
      const documents = names.map((name) => ({ _id: randomUUID(), name, createdAt }));
      await this.collection.insertMany(documents, { session });
      return documents.map(toEntity);
    });
  }
}

function toEntity(document: ${names.pascal}Document): ${names.pascal}Entity {
  return { id: document._id, name: document.name, createdAt: document.createdAt };
}

function mapRepositoryError(): ${names.pascal}RepositoryError {
  return { code: "repository_error" };
}
`,
    },
    {
      path: `${sourceRoot}/${names.kebab}-mongo.module.ts`,
      contents: `import { Module } from "@nestjs/common";
import { ${names.pascal}Repository } from "./${names.kebab}-mongo.repository";

@Module({
  providers: [${names.pascal}Repository],
  exports: [${names.pascal}Repository],
})
export class ${names.pascal}MongoModule {}
`,
    },
    {
      path: `${sourceRoot}/migrations/Migration${migrationTimestamp}Initialize${names.pascal}.ts`,
      contents: `import type { Db } from "mongodb";
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { MongoMigration } from "../../../../shared/lib/src/migrations/mongo-migration";
import { initialize${names.pascal}Collection, verify${names.pascal}Collection } from "../${names.kebab}-mongo.collection";

export const Migration${migrationTimestamp}Initialize${names.pascal}: MongoMigration = {
  id: "${migrationTimestamp}_initialize_${collectionName}",
  name: "Initialize${names.pascal}",

  async up(database: Db): Promise<void> {
    await initialize${names.pascal}Collection(database);
  },

  async verify(database: Db): Promise<void> {
    await verify${names.pascal}Collection(database);
  },
};
`,
    },
    {
      path: `${sourceRoot}/migrations/index.ts`,
      contents: `import { Migration${migrationTimestamp}Initialize${names.pascal} } from "./Migration${migrationTimestamp}Initialize${names.pascal}";

export * from "./Migration${migrationTimestamp}Initialize${names.pascal}";

export const ${names.camel}MongoMigrations = [Migration${migrationTimestamp}Initialize${names.pascal}] as const;
`,
    },
    {
      path: `${sourceRoot}/${names.kebab}-mongo.collection.spec.ts`,
      contents: `// @requirements ${generatedRequirementId(names.kebab)}
import { describe, expect, it, vi } from "vitest";
import { ${names.pascal}CreatedAtIndexName, initialize${names.pascal}Collection } from "./${names.kebab}-mongo.collection";

describe("initialize${names.pascal}Collection", () => {
  it("reconciles an existing collection and creates named indexes idempotently", async () => {
    const createIndexes = vi.fn().mockResolvedValue([]);
    const database = {
      createCollection: vi.fn().mockRejectedValue({ code: 48 }),
      command: vi.fn().mockResolvedValue({ ok: 1 }),
      collection: vi.fn(() => ({ createIndexes })),
    };

    await initialize${names.pascal}Collection(database as never);
    expect(database.command).toHaveBeenCalledWith(expect.objectContaining({ collMod: "${collectionName}" }));
    expect(createIndexes).toHaveBeenCalledWith([
      expect.objectContaining({ name: ${names.pascal}CreatedAtIndexName }),
    ]);
  });
});
`,
    },
    {
      path: `${sourceRoot}/${names.kebab}-mongo.repository.spec.ts`,
      contents: `// @requirements ${generatedRequirementId(names.kebab)}
import { describe, expect, it, vi } from "vitest";
import { ${names.pascal}Repository } from "./${names.kebab}-mongo.repository";

describe("${names.pascal}Repository", () => {
  it("uses one transaction session for a multi-document create", async () => {
    const session = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn().mockResolvedValue(undefined),
      abortTransaction: vi.fn(),
      endSession: vi.fn().mockResolvedValue(undefined),
      inTransaction: vi.fn(() => true),
    };
    const insertMany = vi.fn().mockResolvedValue({ acknowledged: true });
    const database = { collection: vi.fn(() => ({ insertMany })) };
    const client = { startSession: vi.fn(() => session) };
    const repository = new ${names.pascal}Repository(database as never, client as never);

    const result = await repository.createMany(["First", "Second"]);
    expect(result.isOk()).toBe(true);
    expect(insertMany).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: "First" }), expect.objectContaining({ name: "Second" })]),
      { session },
    );
    expect(session.commitTransaction).toHaveBeenCalledOnce();
  });
});
`,
    },
    {
      path: `${sourceRoot}/${names.kebab}-mongo.repository.component-spec.ts`,
      contents: `// @requirements ${generatedRequirementId(names.kebab)}
import { MongoDBContainer, type StartedMongoDBContainer } from "@testcontainers/mongodb";
import { MongoClient } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// eslint-disable-next-line @nx/enforce-module-boundaries
import { runMongoMigrations } from "../../../shared/lib/src/migrations/mongo-migration";
import { ${names.pascal}CreatedAtIndexName, ${names.pascal}CollectionName } from "./${names.kebab}-mongo.collection";
import { ${names.pascal}Repository } from "./${names.kebab}-mongo.repository";
import { ${names.camel}MongoMigrations } from "./migrations";

describe("MongoDB ${names.title} persistence", () => {
  let container: StartedMongoDBContainer;
  let client: MongoClient;
  let repository: ${names.pascal}Repository;

  beforeAll(async () => {
    container = await new MongoDBContainer("mongo:7.0.26-jammy").start();
    const connectionString = container.getConnectionString();
    const separator = connectionString.includes("?") ? "&" : "?";
    client = new MongoClient(connectionString + separator + "directConnection=true&replicaSet=rs0");
    await client.connect();
    const database = client.db("${collectionName}_component");
    await expect(runMongoMigrations(database, ${names.camel}MongoMigrations)).resolves.toEqual({
      applied: ["${migrationTimestamp}_initialize_${collectionName}"],
      skipped: [],
    });
    await expect(runMongoMigrations(database, ${names.camel}MongoMigrations)).resolves.toEqual({
      applied: [],
      skipped: ["${migrationTimestamp}_initialize_${collectionName}"],
    });
    repository = new ${names.pascal}Repository(database, client);
  });

  afterAll(async () => {
    await client.close();
    await container.stop();
  });

  it("atomically creates and lists multiple documents with the canonical index", async () => {
    expect((await repository.createMany(["First", "Second"])).isOk()).toBe(true);
    expect((await repository.list())._unsafeUnwrap()).toHaveLength(2);
    const indexes = await client.db("${collectionName}_component").collection(${names.pascal}CollectionName).indexes();
    expect(indexes.map((index) => index.name)).toContain(${names.pascal}CreatedAtIndexName);
  });
});
`,
    },
    mongoProjectJson(libDir, alias, sourceRoot, `dist/libs/backend/mongodb/main/${names.kebab}`, [
      'platform:backend',
      'type:data-access',
      `scope:${names.kebab}`,
    ]),
    ...tsconfig(libDir),
    mongoComponentTestConfig(libDir),
    ...projectGuides(
      libDir,
      alias,
      ['platform:backend', 'type:data-access', `scope:${names.kebab}`],
      `${names.title} native MongoDB collection, transactional repository, and idempotent indexes.`,
    ),
  ];
}

// ---------------------------------------------------------------------------

function createBackendTemplateFiles(
  names: ReturnType<typeof generateNames>,
  frontendRoot: string,
  migrationTimestamp: string,
  database: DatabaseProvider,
): TemplateFile[] {
  const base = `libs/backend/feature/${names.kebab}`;
  const mainAlias = backendFeatureMainAlias(names);
  const sharedAlias = backendFeatureSharedAlias(names);
  const requirementId = generatedRequirementId(names.kebab);

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
      contents: `// @requirements ${requirementId}
import { describe, expect, it } from "vitest";
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
    ...tsconfig(`${base}/shared/lib`, scaffoldCoverageExclusions),
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
      contents:
        database === 'postgres'
          ? `import { Module } from "@nestjs/common";\nimport { ${names.pascal}PostgresModule } from "${backendPostgresMainAlias(names)}";\nimport { ${names.pascal}Controller } from "./${names.kebab}.controller";\nimport { ${names.pascal}Service } from "./${names.kebab}.service";\n\n@Module({\n  imports: [${names.pascal}PostgresModule],\n  controllers: [${names.pascal}Controller],\n  providers: [${names.pascal}Service],\n  exports: [${names.pascal}Service],\n})\nexport class ${names.pascal}Module {}\n`
          : `import { Module } from "@nestjs/common";\nimport { ${names.pascal}MongoModule } from "${backendMongoMainAlias(names)}";\nimport { ${names.pascal}Controller } from "./${names.kebab}.controller";\nimport { ${names.pascal}Service } from "./${names.kebab}.service";\n\n@Module({\n  imports: [${names.pascal}MongoModule],\n  controllers: [${names.pascal}Controller],\n  providers: [${names.pascal}Service],\n  exports: [${names.pascal}Service],\n})\nexport class ${names.pascal}Module {}\n`,
    },
    {
      path: `${base}/main/lib/src/${names.kebab}.service.ts`,
      contents: `import { Inject, Injectable } from "@nestjs/common";\nimport { InternalException } from "@app/backend-common-exception";\nimport { ${names.pascal}Repository } from "${backendDatabaseMainAlias(names, database)}";\nimport type { Create${names.pascal}Dto, ${names.pascal}Dto } from "${sharedAlias}";\n\n@Injectable()\nexport class ${names.pascal}Service {\n  constructor(\n    @Inject(${names.pascal}Repository)\n    private readonly repository: ${names.pascal}Repository,\n  ) {}\n\n  async list(): Promise<${names.pascal}Dto[]> {\n    const result = await this.repository.list();\n    if (result.isErr()) throw new InternalException({ feature: "${names.kebab}", operation: "list" });\n    return result.value.map(toDto);\n  }\n\n  async create(input: Create${names.pascal}Dto): Promise<${names.pascal}Dto> {\n    const result = await this.repository.create(input.name);\n    if (result.isErr()) throw new InternalException({ feature: "${names.kebab}", operation: "create" });\n    return toDto(result.value);\n  }\n}\n\nfunction toDto(entity: { id: string; name: string; createdAt: Date }): ${names.pascal}Dto {\n  return { id: entity.id, name: entity.name, createdAt: entity.createdAt.toISOString() };\n}\n`,
    },
    {
      path: `${base}/main/lib/src/${names.kebab}.controller.ts`,
      contents: `import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";\nimport { ApiProperty } from "@nestjs/swagger";\nimport { IsString, Length } from "class-validator";\nimport { ApiOkDataResponse, ApiExceptions, ApiSessionCookieAuth } from "@app/backend-common-swagger";\nimport { createOkResponse, type OkResponse } from "@app/backend-common-response";\nimport { RbacGuard, SessionAuthGuard, RequirePermissions } from "@app/backend-feature-auth-shared";\nimport { ${permissionReadName(names)}, ${permissionWriteName(names)}, type Create${names.pascal}Dto, type ${names.pascal}Dto } from "${sharedAlias}";\nimport { ${names.pascal}Service } from "./${names.kebab}.service";\n\nclass Create${names.pascal}BodyDto implements Create${names.pascal}Dto {\n  @ApiProperty({ minLength: 1, maxLength: 255 })\n  @IsString()\n  @Length(1, 255)\n  name!: string;\n}\n\nclass ${names.pascal}ResponseDto implements ${names.pascal}Dto {\n  @ApiProperty({ format: "uuid" })\n  id!: string;\n\n  @ApiProperty()\n  name!: string;\n\n  @ApiProperty({ format: "date-time" })\n  createdAt!: string;\n}\n\n@ApiExceptions(400, 401, 403, 429, 500)\n@ApiSessionCookieAuth()\n@Controller("${names.kebab}")\n@UseGuards(new SessionAuthGuard(), new RbacGuard())\nexport class ${names.pascal}Controller {\n  constructor(private readonly ${names.camel}Service: ${names.pascal}Service) {}\n\n  @Get()\n  @RequirePermissions(${permissionReadName(names)})\n  @ApiOkDataResponse(${names.pascal}ResponseDto)\n  async list(): Promise<OkResponse<${names.pascal}Dto[]>> {\n    return createOkResponse(await this.${names.camel}Service.list());\n  }\n\n  @Post()\n  @RequirePermissions(${permissionWriteName(names)})\n  @ApiOkDataResponse(${names.pascal}ResponseDto)\n  async create(\n    @Body() input: Create${names.pascal}BodyDto,\n  ): Promise<OkResponse<${names.pascal}Dto>> {\n    return createOkResponse(await this.${names.camel}Service.create(input));\n  }\n}\n`,
    },
    {
      path: `${base}/main/lib/src/${names.kebab}.service.spec.ts`,
      contents: serviceSpecContents(names, database, requirementId),
    },
    {
      path: `${base}/main/lib/src/${names.kebab}.controller.spec.ts`,
      contents: controllerSpecContents(names, requirementId),
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

    ...(database === 'postgres'
      ? [
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
            path: `libs/backend/postgres/main/${names.kebab}/lib/src/infrastructure/data-access/entities/${names.kebab}.entity.spec.ts`,
            contents: postgresEntitySpecContents(names, requirementId),
          },
          {
            path: `libs/backend/postgres/main/${names.kebab}/lib/src/infrastructure/data-access/repositories/${names.kebab}.repository.spec.ts`,
            contents: postgresRepositorySpecContents(names, requirementId),
          },
          {
            path: `libs/backend/postgres/main/${names.kebab}/lib/src/infrastructure/data-access/migrations/Migration${migrationTimestamp}Create${names.pascal}.ts`,
            contents: `import { Migration } from "@mikro-orm/migrations";\n\nexport class Migration${migrationTimestamp}Create${names.pascal} extends Migration {\n  override up(): void {\n    this.addSql('create table "${names.kebab.replaceAll('-', '_')}" ("id" uuid not null, "name" varchar(255) not null, "created_at" timestamptz not null, constraint "${names.kebab.replaceAll('-', '_')}_pkey" primary key ("id"));');\n  }\n\n  override down(): void {\n    this.addSql('drop table if exists "${names.kebab.replaceAll('-', '_')}" cascade;');\n  }\n}\n`,
          },
          {
            path: `libs/backend/postgres/main/${names.kebab}/lib/src/infrastructure/data-access/migrations/Migration${migrationTimestamp}Create${names.pascal}.spec.ts`,
            contents: `// @requirements ${requirementId}
import { describe, expect, it } from "vitest";
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
            contents: `import { Migration${migrationTimestamp}Create${names.pascal} } from "./Migration${migrationTimestamp}Create${names.pascal}";

export const ${migrationsName(names)} = [Migration${migrationTimestamp}Create${names.pascal}] as const;

export * from "./Migration${migrationTimestamp}Create${names.pascal}";
`,
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
        ]
      : createMongoDataAccessTemplateFiles(names, migrationTimestamp)),

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
      contents:
        database === 'postgres'
          ? `# ${names.title} scaffold\n\nThe backend route, PostgreSQL persistence module, production-registered migration, and frontend page boundary are generated.\n\n## Finish the product flow\n\n1. Define or replace \`${requirementId}\` in OpenSpec and map the generated backend shared, main, and PostgreSQL projects before running \`pnpm spec:validate\`.\n2. Run \`pnpm api:contracts\` and \`pnpm api:clients\` after the API compiles.\n3. Add a frontend API wrapper that imports only \`@app/frontend-api-client\`.\n4. Register the page in the owning application router with translated copy.\n5. Add component and e2e coverage for loading, error, empty, success, auth, and RBAC states.\n`
          : `# ${names.title} scaffold\n\nThe backend route, native MongoDB persistence module, production-registered migration, idempotent indexes, and frontend page boundary are generated.\n\n## Finish the product flow\n\n1. Define or replace \`${requirementId}\` in OpenSpec and map the generated backend shared, main, and MongoDB projects before running \`pnpm spec:validate\`.\n2. Run \`pnpm api:contracts\` and \`pnpm api:clients\` after the API compiles.\n3. Add a frontend API wrapper that imports only \`@app/frontend-api-client\`.\n4. Register the page in the owning application router with translated copy.\n5. Add component and e2e coverage for loading, error, empty, success, auth, and RBAC states.\n`,
    },
  ];
}

// ---------------------------------------------------------------------------

function createTsconfigAliases(
  names: ReturnType<typeof generateNames>,
  database: DatabaseProvider,
): Record<string, string[]> {
  return {
    [backendFeatureMainAlias(names)]: [`libs/backend/feature/${names.kebab}/main/lib/src/index.ts`],
    [backendFeatureSharedAlias(names)]: [`libs/backend/feature/${names.kebab}/shared/lib/src/index.ts`],
    [backendDatabaseMainAlias(names, database)]: [`${databaseRoot(names, database)}/src/index.ts`],
  };
}

function findExistingTsconfigAliases(
  tree: Tree,
  names: ReturnType<typeof generateNames>,
  database: DatabaseProvider,
): string[] {
  const tsconfig = readJsonFile(tree, 'tsconfig.base.json');
  const compilerOptions = tsconfig?.compilerOptions as { paths?: Record<string, string[]> } | undefined;
  const paths = compilerOptions?.paths ?? {};
  const newAliases = createTsconfigAliases(names, database);
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

function assertSupportedOwnerRuntimes(tree: Tree, apiApp: string, frontendApp: string): void {
  const projects = getProjects(tree);
  const apiRoot = projects.get(apiApp)?.root;
  const apiMain = apiRoot ? tree.read(`${apiRoot}/src/main.ts`, 'utf8') : null;
  if (!apiRoot || !apiMain || !/\bbootstrapNestApi\s*\(/u.test(apiMain)) {
    throw new Error(
      `Incompatible --api-app "${apiApp}". Vertical HTTP features require a Nest API owner that uses bootstrapNestApi; consumers and schedulers are not supported.`,
    );
  }

  const frontendProject = projects.get(frontendApp);
  const frontendRoot = frontendProject?.root;
  if (
    !frontendRoot ||
    frontendProject.sourceRoot !== `${frontendRoot}/src` ||
    !tree.exists(`${frontendRoot}/vite.config.mts`)
  ) {
    throw new Error(
      `Incompatible --frontend-app "${frontendApp}". Vertical page features currently require a Vite web application with an src/pages FSD boundary; Astro, Vike, and Expo owners are not supported.`,
    );
  }
}

function planProductionMigrationRegistration(tree: Tree, names: ReturnType<typeof generateNames>): string {
  const contents = tree.read(productionMigrationRunnerPath, 'utf8');
  const registrationName = migrationsName(names);
  const alias = backendPostgresMainAlias(names);
  if (!contents) {
    throw new Error(
      `Cannot register ${alias} migrations: ${productionMigrationRunnerPath} is missing. Generation stopped before writes.`,
    );
  }
  const importPathIndex = contents.indexOf(productionMigrationImportPath);
  let importAnchor: string | undefined;
  if (
    importPathIndex >= 0 &&
    contents.indexOf(productionMigrationImportPath, importPathIndex + productionMigrationImportPath.length) === -1
  ) {
    const importStart = contents.lastIndexOf('const', importPathIndex);
    const importEnd = contents.indexOf(';', importPathIndex);
    if (importStart >= 0 && importEnd >= importPathIndex) {
      const candidate = contents.slice(importStart, importEnd + 1);
      if (
        candidate.includes(productionMigrationImportName) &&
        candidate.includes('require') &&
        candidate.includes('resolve')
      ) {
        importAnchor = candidate;
      }
    }
  }
  if (importAnchor === undefined) {
    throw new Error(
      `Cannot register ${alias} migrations: ${productionMigrationRunnerPath} does not expose the supported import anchor. Generation stopped before writes.`,
    );
  }
  const migrationLists = [...contents.matchAll(productionMigrationListPattern)];
  const migrationList = migrationLists[0];
  const existingMigrations = migrationList?.[1];
  const listStart = migrationList?.index;
  if (
    migrationLists.length !== 1 ||
    migrationList === undefined ||
    existingMigrations === undefined ||
    listStart === undefined
  ) {
    throw new Error(
      `Cannot register ${alias} migrations: ${productionMigrationRunnerPath} must contain exactly one migrationsList array. Generation stopped before writes.`,
    );
  }
  if (contents.includes(alias) || contents.includes(registrationName)) {
    throw new Error(
      `Cannot register ${alias} migrations: the production migration runner already contains a partial or duplicate registration.`,
    );
  }

  const migrationIndentation = /\n([ \t]*)\S/u.exec(existingMigrations)?.[1] ?? '  ';
  const closingIndentation = /\n([ \t]*)$/u.exec(existingMigrations)?.[1] ?? '';
  const updatedMigrations = existingMigrations.includes('\n')
    ? `${existingMigrations.trimEnd()}\n${migrationIndentation}...${registrationName},\n${closingIndentation}`
    : `${existingMigrations.trim()}${existingMigrations.trim() ? ', ' : ''}...${registrationName}`;
  const withMigration = `${contents.slice(0, listStart)}${migrationList[0].replace(existingMigrations, updatedMigrations)}${contents.slice(listStart + migrationList[0].length)}`;
  const importLine = `const { ${registrationName} } = require("${alias}");\n`;
  return withMigration.replace(importAnchor, `${importLine}${importAnchor}`);
}

function defaultMigrationTimestamp(): string {
  return new Date().toISOString().replaceAll(/\D/g, '').slice(0, 14);
}

function resolveDatabaseProvider(tree: Tree, requested: FeatureGeneratorOptions['database']): DatabaseProvider {
  if (requested !== undefined && requested !== 'postgres' && requested !== 'mongodb') {
    throw new Error(`Unsupported database provider "${String(requested)}". Must be one of: postgres, mongodb`);
  }

  const manifestContents = tree.read('.nrb/workspace.json', 'utf8');
  if (!manifestContents) {
    return requested ?? 'postgres';
  }

  let capabilities: unknown;
  try {
    capabilities = (JSON.parse(manifestContents) as { capabilities?: unknown }).capabilities;
  } catch {
    throw new Error('Cannot resolve database provider: .nrb/workspace.json is not valid JSON.');
  }
  const selected = ['postgres', 'mongodb'].filter(
    (provider) => Array.isArray(capabilities) && capabilities.includes(provider),
  ) as DatabaseProvider[];
  if (selected.length !== 1) {
    throw new Error(
      'Cannot resolve database provider: .nrb/workspace.json must select exactly one of postgres or mongodb.',
    );
  }
  if (requested && requested !== selected[0]) {
    throw new Error(
      `Database provider mismatch: requested "${requested}" but .nrb/workspace.json selects "${selected[0]}".`,
    );
  }
  return selected[0] as DatabaseProvider;
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

const mongoMigrationRegistryPath = 'packages/tooling/src/commands/db/generated-mongo-migrations.ts';
const mongoMigrationImportStart = '// <nrb-generated-mongo-migration-imports>';
const mongoMigrationImportEnd = '// </nrb-generated-mongo-migration-imports>';
const mongoMigrationEntryStart = '  // <nrb-generated-mongo-migration-entries>';
const mongoMigrationEntryEnd = '  // </nrb-generated-mongo-migration-entries>';

function planMongoMigrationRegistration(tree: Tree, names: ReturnType<typeof generateNames>): string {
  let contents = tree.read(mongoMigrationRegistryPath, 'utf8');
  if (!contents) {
    throw new Error(
      `Cannot register ${backendMongoMainAlias(names)} migrations: ${mongoMigrationRegistryPath} is missing. Generation stopped before writes.`,
    );
  }
  const registrationName = `${names.camel}MongoMigrations`;
  if (contents.includes(registrationName)) {
    throw new Error(
      `Cannot register ${backendMongoMainAlias(names)} migrations: the production migration registry already contains a partial or duplicate registration.`,
    );
  }
  contents = insertSortedGeneratedLine(
    contents,
    mongoMigrationImportStart,
    mongoMigrationImportEnd,
    `import { ${registrationName} } from "../../../../../libs/backend/mongodb/main/${names.kebab}/lib/src/migrations/index.ts";`,
  );
  contents = insertSortedGeneratedLine(
    contents,
    mongoMigrationEntryStart,
    mongoMigrationEntryEnd,
    `  ...${registrationName},`,
  );
  return contents;
}

function insertSortedGeneratedLine(contents: string, startMarker: string, endMarker: string, line: string): string {
  const start = contents.indexOf(startMarker);
  const end = contents.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    throw new Error(`Cannot register MongoDB migration: ${mongoMigrationRegistryPath} has invalid generated markers.`);
  }

  const bodyStart = start + startMarker.length;
  const lines = contents
    .slice(bodyStart, end)
    .split('\n')
    .map((candidate) => candidate.trimEnd())
    .filter((candidate) => candidate.trim() !== '');
  const generated = [...new Set([...lines, line])].sort((left, right) => left.localeCompare(right));
  return `${contents.slice(0, bodyStart)}\n${generated.join('\n')}\n${contents.slice(end)}`;
}

// ---------------------------------------------------------------------------

export interface FeatureGeneratorOptions {
  name: string;
  apiApp: string;
  frontendApp: string;
  database?: DatabaseProvider;
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
  if (options.force) {
    throw new Error('--force regeneration is disabled. Modify the existing feature owner in place.');
  }
  if (!options.apiApp || !options.frontendApp) {
    throw new Error(
      'Feature generation requires explicit --api-app and --frontend-app owners; this monorepo has no default application.',
    );
  }

  const names = generateNames(options.name);
  const apiApp = options.apiApp;
  const frontendApp = options.frontendApp;
  const database = resolveDatabaseProvider(tree, options.database);
  const migrationTimestamp = String(options.migrationTimestamp ?? defaultMigrationTimestamp());
  if (!/^\d{14}$/.test(migrationTimestamp)) {
    throw new Error('--migration-timestamp must contain exactly 14 digits (YYYYMMDDHHmmss).');
  }

  const adjacentOwner = findAdjacentOwner(
    names.kebab,
    [...getProjects(tree).entries()]
      .filter(([, config]) => config.root?.includes('/feature/'))
      .map(([name, config]) => ({ name, root: config.root })),
  );
  if (adjacentOwner) {
    throw new Error(
      `Refusing adjacent feature "${names.kebab}" beside existing owner "${adjacentOwner}". Modify the existing owner in place.`,
    );
  }

  const validApiApps = listApiApps(tree);
  if (!validApiApps.includes(apiApp)) {
    throw new Error(
      `Invalid --api-app "${apiApp}". Expected one of: ${validApiApps.join(', ') || '(none found under apps/backend)'}.`,
    );
  }

  const validFrontendApps = listFrontendApps(tree);
  if (!validFrontendApps.includes(frontendApp)) {
    throw new Error(`Invalid --frontend-app "${frontendApp}". Expected one of: ${validFrontendApps.join(', ')}.`);
  }
  const frontendRoot = projectRoot(tree, frontendApp);
  if (!frontendRoot) {
    throw new Error(`Cannot resolve --frontend-app "${frontendApp}" to an Nx project root.`);
  }
  assertSupportedOwnerRuntimes(tree, apiApp, frontendApp);

  const otherDatabase = database === 'postgres' ? 'mongodb' : 'postgres';
  const tsconfig = readJsonFile(tree, 'tsconfig.base.json');
  const compilerOptions = tsconfig?.compilerOptions as { paths?: Record<string, string[]> } | undefined;
  const otherAlias = backendDatabaseMainAlias(names, otherDatabase);
  const otherRoot = databaseRoot(names, otherDatabase);
  if (tree.exists(`${otherRoot}/project.json`) || compilerOptions?.paths?.[otherAlias]) {
    throw new Error(
      `Database provider collision: feature scope "${names.kebab}" already has ${otherDatabase} ownership at ${otherRoot}.`,
    );
  }

  const files = createBackendTemplateFiles(names, frontendRoot, migrationTimestamp, database);

  const existingFiles = findExistingFiles(tree, files);
  const existingAliases = findExistingTsconfigAliases(tree, names, database);
  if (existingFiles.length > 0 || existingAliases.length > 0) {
    const conflicts: string[] = [];
    for (const p of existingFiles) {
      conflicts.push(`File exists: ${p}`);
    }
    for (const a of existingAliases) {
      conflicts.push(`Tsconfig alias exists: ${a}`);
    }
    throw new Error(
      `Refusing to overwrite existing files or aliases. Modify the existing feature owner in place:\n${conflicts.join('\n')}`,
    );
  }
  const migrationRegistration =
    database === 'postgres'
      ? {
          path: productionMigrationRunnerPath,
          contents: planProductionMigrationRegistration(tree, names),
          description: 'production migration registration (PostgreSQL)',
        }
      : {
          path: mongoMigrationRegistryPath,
          contents: planMongoMigrationRegistration(tree, names),
          description: `production migration registration (MongoDB): register ${names.camel}MongoMigrations`,
        };

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
      const newAliases = createTsconfigAliases(names, database);
      compilerOptions.paths = { ...paths, ...newAliases };
      writeJsonFile(tree, 'tsconfig.base.json', tsconfig);
    }
    tree.write(migrationRegistration.path, migrationRegistration.contents);
  } else {
    console.log('UPDATE tsconfig.base.json path aliases');
    console.log(`UPDATE ${migrationRegistration.path} ${migrationRegistration.description}`);
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
