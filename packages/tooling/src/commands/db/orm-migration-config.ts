// @ts-nocheck
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const tsconfigPath = resolve(workspaceRoot, "tsconfig.base.json");
process.env.SWC_NODE_PROJECT ??= tsconfigPath;
require("@swc-node/register");
const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));
require("tsconfig-paths").register({ baseUrl: workspaceRoot, paths: tsconfig.compilerOptions.paths });
const { MikroORM } = require("@mikro-orm/core");
const { AuthUserEntitySchema, authMigrationOptions, AuthMigrationsTableName } = require("@app/postgres-main-auth");
const { FeatureFlagEntitySchema } = require("@app/postgres-main-feature-flags");
const { createPostgresMikroOrmOptions } = require("@app/postgres-main");
export const authMigrationTableName = AuthMigrationsTableName;
export function createAuthMigrationOrmOptions(env = process.env) { return createPostgresMikroOrmOptions({ entities: [AuthUserEntitySchema, FeatureFlagEntitySchema], autoLoadEntities: false, allowGlobalContext: true, migrations: authMigrationOptions }, env); }
export async function initAuthMigrationOrm(env = process.env) { return MikroORM.init(createAuthMigrationOrmOptions(env)); }
export function migrationNames(migrations) { return migrations.map((migration) => migration.name); }
