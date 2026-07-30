import { pbkdf2Sync, randomBytes } from "node:crypto";
import { MongoClient, type ClientSession, type Db, type Document } from "mongodb";
import { assertMongoTransactionTopology } from "../../../../../libs/backend/mongodb/main/shared/lib/src/mongo.topology.ts";
import { createMongoOperationEnvironment } from "./mongo-client.ts";
import {
  DefaultTenantId,
  permissionUuids,
  permissions,
  rolePermissions,
  roleUuids,
  roles,
  type SeedUser,
} from "./seed-data.ts";

const collections = {
  permissions: "auth_permissions",
  roles: "auth_roles",
  rolePermissions: "auth_role_permissions",
  users: "auth_users",
  userRoles: "auth_user_roles",
} as const;

interface StringIdDocument extends Document {
  _id: string;
}

export interface MongoSeedCounts {
  permissions: number;
  roles: number;
  rolePermissions: number;
  users: number;
  userRoles: number;
}

export async function seedMongoDatabase(
  seedUsers: SeedUser[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ database: string; inserted: MongoSeedCounts }> {
  const config = createMongoOperationEnvironment(env);
  const client = new MongoClient(config.uri, {
    appName: "nrb-db-seed",
    replicaSet: config.replicaSet,
    retryWrites: true,
    writeConcern: { w: "majority" },
  });
  try {
    await client.connect();
    await assertMongoTransactionTopology(client, config.replicaSet);
    const inserted = await client.withSession((session) =>
      session.withTransaction(
        () => seedMongoBootstrap(client.db(config.database), seedUsers, session),
        {
          readConcern: { level: "snapshot" },
          readPreference: "primary",
          writeConcern: { w: "majority" },
        },
      ),
    );
    if (inserted === undefined) throw new Error("MongoDB seed transaction did not complete.");
    return { database: config.database, inserted };
  } finally {
    await client.close();
  }
}

export async function seedMongoBootstrap(
  database: Pick<Db, "collection">,
  seedUsers: SeedUser[],
  session: ClientSession,
): Promise<MongoSeedCounts> {
  const counts: MongoSeedCounts = {
    permissions: 0,
    roles: 0,
    rolePermissions: 0,
    users: 0,
    userRoles: 0,
  };
  const now = new Date();
  const permissionIds = new Map<string, string>();
  const roleIds = new Map<string, string>();

  for (const permission of permissions) {
    const id = requiredId(permissionUuids[permission.key], `permission ${permission.key}`);
    const result = await database.collection<StringIdDocument>(collections.permissions).updateOne(
      { key: permission.key },
      { $setOnInsert: { _id: id, ...permission, createdAt: now } },
      { upsert: true, session },
    );
    counts.permissions += result.upsertedCount;
    const stored = await database.collection<StringIdDocument>(collections.permissions).findOne(
      { key: permission.key },
      { projection: { _id: 1 }, session },
    );
    permissionIds.set(permission.key, requiredId(stored?._id, `stored permission ${permission.key}`));
  }

  for (const role of roles) {
    const id = requiredId(roleUuids[role.key], `role ${role.key}`);
    const result = await database.collection<StringIdDocument>(collections.roles).updateOne(
      { tenantId: DefaultTenantId, key: role.key },
      {
        $setOnInsert: {
          _id: id,
          tenantId: DefaultTenantId,
          ...role,
          isSystem: true,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true, session },
    );
    counts.roles += result.upsertedCount;
    const stored = await database.collection<StringIdDocument>(collections.roles).findOne(
      { tenantId: DefaultTenantId, key: role.key },
      { projection: { _id: 1 }, session },
    );
    roleIds.set(role.key, requiredId(stored?._id, `stored role ${role.key}`));
  }

  let grantIndex = 0;
  for (const role of roles) {
    const roleId = requiredId(roleIds.get(role.key), `role ${role.key}`);
    for (const permissionKey of rolePermissions[role.key] ?? []) {
      grantIndex += 1;
      const permissionId = requiredId(permissionIds.get(permissionKey), `permission ${permissionKey}`);
      const result = await database.collection<StringIdDocument>(collections.rolePermissions).updateOne(
        { roleId, permissionId },
        {
          $setOnInsert: {
            _id: deterministicJoinId("40000000", grantIndex),
            roleId,
            permissionId,
            createdAt: now,
          },
        },
        { upsert: true, session },
      );
      counts.rolePermissions += result.upsertedCount;
    }
  }

  for (const user of seedUsers) {
    const result = await database.collection<StringIdDocument>(collections.users).updateOne(
      { _id: user.id, tenantId: DefaultTenantId },
      {
        $setOnInsert: {
          _id: user.id,
          tenantId: DefaultTenantId,
          email: user.email,
          displayName: user.displayName,
          passwordHash: hashPassword(user.password),
          status: "active",
          locale: user.locale,
          theme: user.theme,
          lastLoginAt: new Date(0),
          avatarUrl: "",
          avatarHash: "",
          avatarStatus: "none",
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true, session },
    );
    counts.users += result.upsertedCount;
  }

  for (const [index, user] of seedUsers.entries()) {
    const roleId = requiredId(roleIds.get(user.role), `role ${user.role}`);
    const result = await database.collection<StringIdDocument>(collections.userRoles).updateOne(
      { tenantId: DefaultTenantId, userId: user.id, roleId },
      {
        $setOnInsert: {
          _id: deterministicJoinId("50000000", index + 1),
          tenantId: DefaultTenantId,
          userId: user.id,
          roleId,
          grantedByUserId: null,
          createdAt: now,
        },
      },
      { upsert: true, session },
    );
    counts.userRoles += result.upsertedCount;
  }

  return counts;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const digest = pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString("base64url");
  return `pbkdf2_sha256$120000$${salt}$${digest}`;
}

function deterministicJoinId(prefix: string, index: number): string {
  return `${prefix}-0000-0000-0000-${String(index).padStart(12, "0")}`;
}

function requiredId(value: unknown, name: string): string {
  if (typeof value !== "string" || value === "") throw new Error(`Missing deterministic ID for ${name}.`);
  return value;
}
