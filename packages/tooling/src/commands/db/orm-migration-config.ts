// @ts-nocheck
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("@swc-node/register");
const { MikroORM } = require("@mikro-orm/core");
const { AuthUserEntitySchema } = require("../../../../libs/backend/postgres/main/auth/lib/src/lib/entity/auth-user.entity.ts");
const { FeatureFlagEntitySchema } = require("../../../../libs/backend/postgres/main/feature-flags/lib/src/lib/entity/feature-flag.entity.ts");
const { authMigrationOptions, AuthMigrationsTableName } = require("../../../../libs/backend/postgres/main/auth/lib/src/lib/migrations/index.ts");
const { createPostgresMikroOrmOptions } = require("../../../../libs/backend/postgres/main/shared/lib/src/lib/data-source-options.ts");
export const authMigrationTableName = AuthMigrationsTableName;
export function createAuthMigrationOrmOptions(env = process.env) { return createPostgresMikroOrmOptions({ entities: [AuthUserEntitySchema, FeatureFlagEntitySchema], autoLoadEntities: false, allowGlobalContext: true, migrations: authMigrationOptions }, env); }
export async function initAuthMigrationOrm(env = process.env) { return MikroORM.init(createAuthMigrationOrmOptions(env)); }
export function migrationNames(migrations) { return migrations.map((migration) => migration.name); }
