#!/usr/bin/env node
/**
 * Database seed command — realistic RBAC data.
 *
 * Seeds (idempotently, inside a transaction):
 *   1. Permissions  — 13 rows from the @app/common-authz permission catalog
 *   2. Roles        — admin + user (system roles under default tenant)
 *   3. Role↔Permission grants  — admin gets full admin catalog; user gets profile:read
 *   4. Users        — 3 seed users with hashed passwords
 *   5. User↔Role assignments  — links users to their roles
 *
 * Safe to run repeatedly: every INSERT uses ON CONFLICT DO NOTHING.
 * Existing rows are left untouched.
 *
 * Usage:
 *   pnpm db:seed                       # normal run (safety-checked)
 *   pnpm db:seed --dry-run             # print plan without touching DB
 *   pnpm db:seed --force               # bypass local-dev guard
 *   pnpm db:seed --email foo@bar.com   # override admin email
 *   pnpm db:seed --password-env SECRET # read password from env var
 */

import { pbkdf2Sync, randomBytes } from "node:crypto";
import pg from "pg";
import {
  assertSeedSafety,
  DefaultAdminEmail,
  DefaultAdminPassword,
  resolvePassword,
} from "./seed-safety.ts";
import {
  assertLocalDevelopmentDatabase,
  loadDotEnv,
  postgresConnectionString,
  redactedConnectionString,
} from "./env-loader.ts";

// ── Deterministic UUIDs (fixed per entity, makes seeding idempotent) ──────────

const DefaultTenantId = "00000000-0000-0000-0000-000000000000";

const permissionUuids: Record<string, string> = {
  "profile:read": "10000000-0000-0000-0000-000000000001",
  "admin:dashboard:read": "10000000-0000-0000-0000-000000000002",
  "admin:profile:read": "10000000-0000-0000-0000-000000000003",
  "admin:users:read": "10000000-0000-0000-0000-000000000004",
  "admin:users:write": "10000000-0000-0000-0000-000000000005",
  "admin:users:status:update": "10000000-0000-0000-0000-000000000006",
  "admin:users:access-policy:update": "10000000-0000-0000-0000-000000000007",
  "admin:roles:read": "10000000-0000-0000-0000-000000000008",
  "admin:roles:write": "10000000-0000-0000-0000-000000000009",
  "admin:audit:read": "10000000-0000-0000-0000-00000000000a",
  "admin:settings:read": "10000000-0000-0000-0000-00000000000b",
  "admin:settings:update": "10000000-0000-0000-0000-00000000000c",
  "admin:manage:all": "10000000-0000-0000-0000-00000000000d",
};

const roleUuids: Record<string, string> = {
  user: "20000000-0000-0000-0000-000000000001",
  admin: "20000000-0000-0000-0000-000000000002",
};

// ── Permission catalog (mirrors libs/common/authz/lib/src/permission-catalog.ts) ──

const permissions = [
  { key: "profile:read", resource: "profile", action: "read", description: "Read the signed-in user's own profile." },
  { key: "admin:dashboard:read", resource: "admin.dashboard", action: "read", description: "Read admin dashboard metrics and summaries." },
  { key: "admin:profile:read", resource: "admin.profile", action: "read", description: "Read the current administrator profile." },
  { key: "admin:users:read", resource: "admin.users", action: "read", description: "Search and inspect admin-visible user records." },
  { key: "admin:users:write", resource: "admin.users", action: "write", description: "General guarded admin user write capability." },
  { key: "admin:users:status:update", resource: "admin.users", action: "status:update", description: "Enable, disable, or invite admin-visible users." },
  { key: "admin:users:access-policy:update", resource: "admin.users", action: "access-policy:update", description: "Update user roles and permission assignments." },
  { key: "admin:roles:read", resource: "admin.roles", action: "read", description: "Read the admin RBAC roles and permissions catalog." },
  { key: "admin:roles:write", resource: "admin.roles", action: "write", description: "Create and update admin RBAC roles and their grants." },
  { key: "admin:audit:read", resource: "admin.audit", action: "read", description: "Read redacted admin audit events." },
  { key: "admin:settings:read", resource: "admin.settings", action: "read", description: "Read admin settings metadata." },
  { key: "admin:settings:update", resource: "admin.settings", action: "update", description: "Update guarded admin settings." },
  { key: "admin:manage:all", resource: "all", action: "manage", description: "Explicit break-glass permission to manage every admin resource." },
] as const;

// ── Role → permission matrix (mirrors libs/common/authz/lib/src/role-matrix.ts) ──

const rolePermissions: Record<string, readonly string[]> = {
  user: ["profile:read"],
  admin: [
    "admin:dashboard:read",
    "admin:profile:read",
    "admin:users:read",
    "admin:users:write",
    "admin:users:status:update",
    "admin:users:access-policy:update",
    "admin:roles:read",
    "admin:roles:write",
    "admin:audit:read",
    "admin:settings:read",
    "admin:settings:update",
    "admin:manage:all",
  ],
};

const roles = [
  { key: "user", label: "User", description: "Standard application user." },
  { key: "admin", label: "Administrator", description: "Full administrative access." },
];

// ── Seed users ─────────────────────────────────────────────────────────────────

interface SeedUser {
  id: string;
  email: string;
  displayName: string;
  password: string;
  role: string;
  locale: string;
  theme: string;
}

const userUuids = [
  "30000000-0000-0000-0000-000000000001",
  "30000000-0000-0000-0000-000000000002",
  "30000000-0000-0000-0000-000000000003",
];

function buildSeedUsers(basePassword: string): SeedUser[] {
  const adminPwd = basePassword === DefaultAdminPassword
    ? "Admin@Secure1!"
    : basePassword;
  return [
    {
      id: userUuids[0],
      email: DefaultAdminEmail,
      displayName: "Alice Administrator",
      password: adminPwd,
      role: "admin",
      locale: "en",
      theme: "system",
    },
    {
      id: userUuids[1],
      email: "bob.user@example.com",
      displayName: "Bob User",
      password: "Bob@User456!",
      role: "user",
      locale: "en",
      theme: "light",
    },
    {
      id: userUuids[2],
      email: "charlie.dev@example.com",
      displayName: "Charlie Developer",
      password: "Charlie@Dev789!",
      role: "user",
      locale: "en",
      theme: "dark",
    },
  ];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const digest = pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString(
    "base64url",
  );
  return `pbkdf2_sha256$120000$${salt}$${digest}`;
}

function parseArgs(argv: string[]) {
  const args = {
    dryRun: false,
    force: false,
    email: DefaultAdminEmail,
    password: DefaultAdminPassword,
    passwordEnv: "",
    displayName: "Local Admin",
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--") continue;
    const val = () => {
      const next = argv[++i];
      if (!next) throw new Error(`${item} requires a value.`);
      return next;
    };
    if (item === "--dry-run") args.dryRun = true;
    else if (item === "--force") args.force = true;
    else if (item === "--email") args.email = val();
    else if (item === "--password") args.password = val();
    else if (item === "--password-env") args.passwordEnv = val();
    else if (item === "--display-name") args.displayName = val();
    else if (item === "--help" || item === "-h") args.help = true;
    else throw new Error(`Unknown option: ${item}`);
  }
  return args;
}

// ── SQL helpers ────────────────────────────────────────────────────────────────

function sqlText(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

// ── Seed logic ─────────────────────────────────────────────────────────────────

async function seed(client: pg.Client, seedUsers: SeedUser[]): Promise<Record<string, number>> {
  await client.query("BEGIN");
  const counts = { permissions: 0, roles: 0, rolePermissions: 0, users: 0, userRoles: 0 };

  try {
    // 1. Seed permissions
    for (const p of permissions) {
      const uuid = permissionUuids[p.key];
      if (!uuid) {
        console.warn(`[seed] Warning: no deterministic UUID for permission "${p.key}", skipping.`);
        continue;
      }
      const { rowCount } = await client.query(
        `INSERT INTO "auth_permissions" ("id", "key", "resource", "action", "description", "created_at")
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT ("key") DO NOTHING`,
        [uuid, p.key, p.resource, p.action, p.description],
      );
      if (rowCount) counts.permissions += rowCount;
    }

    // 2. Seed roles (under default tenant)
    for (const r of roles) {
      const uuid = roleUuids[r.key];
      if (!uuid) {
        console.warn(`[seed] Warning: no deterministic UUID for role "${r.key}", skipping.`);
        continue;
      }
      const { rowCount } = await client.query(
        `INSERT INTO "auth_roles" ("id", "tenant_id", "key", "label", "description", "is_system", "created_at", "updated_at")
         VALUES ($1, $2, $3, $4, $5, true, now(), now())
         ON CONFLICT ("tenant_id", "key") DO NOTHING`,
        [uuid, DefaultTenantId, r.key, r.label, r.description],
      );
      if (rowCount) counts.roles += rowCount;
    }

    // 3. Seed role → permission grants
    for (const role of roles) {
      const roleUuid = roleUuids[role.key];
      if (!roleUuid) continue;
      const permKeys = rolePermissions[role.key] ?? [];
      for (const permKey of permKeys) {
        const permUuid = permissionUuids[permKey];
        if (!permUuid) continue;
        const { rowCount } = await client.query(
          `INSERT INTO "auth_role_permissions" ("role_id", "permission_id", "created_at")
           VALUES ($1, $2, now())
           ON CONFLICT DO NOTHING`,
          [roleUuid, permUuid],
        );
        if (rowCount) counts.rolePermissions += rowCount;
      }
    }

    // 4. Seed users
    for (const user of seedUsers) {
      const passwordHash = hashPassword(user.password);
      const userRoleKeys = [user.role];
      // Compute permissions for the user's role(s)
      const permKeys = userRoleKeys.flatMap((rk) => rolePermissions[rk] ?? []);
      const { rowCount } = await client.query(
        `INSERT INTO "auth_users" (
           "id", "tenant_id", "email", "display_name", "password_hash",
           "status", "roles", "permissions", "locale", "theme",
           "last_login_at", "avatar_url", "avatar_hash", "avatar_status",
           "created_at", "updated_at"
         )
         VALUES ($1, $2, $3, $4, $5, 'active', $6::jsonb, $7::jsonb, $8, $9,
                 'epoch'::timestamptz, '', '', 'none',
                 now(), now())
         ON CONFLICT DO NOTHING`,
        [
          user.id,
          DefaultTenantId,
          user.email,
          user.displayName,
          passwordHash,
          JSON.stringify(userRoleKeys),
          JSON.stringify(permKeys),
          user.locale,
          user.theme,
        ],
      );
      if (rowCount) counts.users += rowCount;
    }

    // 5. Seed user → role assignments (normalized table)
    for (const user of seedUsers) {
      const roleUuid = roleUuids[user.role];
      if (!roleUuid) continue;
      const { rowCount } = await client.query(
        `INSERT INTO "auth_user_roles" ("auth_user_id", "role_id", "tenant_id", "created_at")
         VALUES ($1, $2, $3, now())
         ON CONFLICT DO NOTHING`,
        [user.id, roleUuid, DefaultTenantId],
      );
      if (rowCount) counts.userRoles += rowCount;
    }

    await client.query("COMMIT");
    return counts;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(
    "Usage: pnpm db:seed [--dry-run] [--force] [--email EMAIL] [--password PASSWORD | --password-env VAR] [--display-name NAME]",
  );
  console.log("");
  console.log("Seed the database with realistic RBAC data:");
  console.log("  - 13 permissions (from @app/common-authz catalog)");
  console.log("  - 2 roles: admin, user");
  console.log("  - Role → permission grants (admin: full catalog, user: profile:read)");
  console.log("  - 3 seed users: Alice (admin), Bob (user), Charlie (user)");
  console.log("  - User → role assignments");
  console.log("");
  console.log("All inserts are idempotent (ON CONFLICT DO NOTHING).");
  process.exit(0);
}

loadDotEnv();
args.password = resolvePassword(args) ?? args.password;
const connectionString = postgresConnectionString();
assertSeedSafety(args, connectionString, { assertLocalDevelopmentDatabase });

const seedUsers = buildSeedUsers(args.password);

const plan = {
  database: redactedConnectionString(connectionString),
  permissions: permissions.map((p) => p.key),
  roles: roles.map((r) => r.key),
  users: seedUsers.map((u) => ({ email: u.email, role: u.role })),
};

if (args.dryRun) {
  console.log(JSON.stringify({ status: "dry-run", plan }, null, 2));
  process.exit(0);
}

const client = new pg.Client({ connectionString });

await client.connect();
try {
  // Verify required tables exist (migration must have run first)
  const tableCheck = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name IN ('auth_users', 'auth_roles', 'auth_permissions', 'auth_role_permissions', 'auth_user_roles')
     ORDER BY table_name`,
  );
  const found = new Set(tableCheck.rows.map((r: any) => r.table_name));
  const required = ["auth_users", "auth_roles", "auth_permissions", "auth_role_permissions", "auth_user_roles"];
  const missing = required.filter((t) => !found.has(t));
  if (missing.length) {
    console.error(
      `[seed] Missing tables: ${missing.join(", ")}. Run migrations first (pnpm db:migrate).`,
    );
    process.exit(1);
  }

  const counts = await seed(client, seedUsers);

  console.log(
    JSON.stringify(
      {
        status: "seeded",
        database: plan.database,
        inserted: counts,
        users: seedUsers.map((u) => ({
          email: u.email,
          displayName: u.displayName,
          role: u.role,
          password: "[hashed]",
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
