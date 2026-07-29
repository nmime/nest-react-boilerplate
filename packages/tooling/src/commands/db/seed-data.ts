import { DefaultAdminEmail, DefaultAdminPassword } from "./seed-safety.ts";

export const DefaultTenantId = "00000000-0000-0000-0000-000000000000";

export const permissionUuids: Record<string, string> = {
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

export const roleUuids: Record<string, string> = {
  user: "20000000-0000-0000-0000-000000000001",
  admin: "20000000-0000-0000-0000-000000000002",
};

export const permissions = [
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

export const rolePermissions: Record<string, readonly string[]> = {
  user: ["profile:read"],
  admin: permissions.filter((permission) => permission.key.startsWith("admin:")).map((permission) => permission.key),
};

export const roles = [
  { key: "user", label: "User", description: "Standard application user." },
  { key: "admin", label: "Administrator", description: "Full administrative access." },
] as const;

export interface SeedUser {
  id: string;
  email: string;
  displayName: string;
  password: string;
  role: string;
  locale: string;
  theme: string;
}

export const userUuids = [
  "30000000-0000-0000-0000-000000000001",
  "30000000-0000-0000-0000-000000000002",
  "30000000-0000-0000-0000-000000000003",
];

export function buildSeedUsers(basePassword: string, locale = "en"): SeedUser[] {
  const adminPassword = basePassword === DefaultAdminPassword ? "Admin@Secure1!" : basePassword;
  return [
    {
      id: userUuids[0],
      email: DefaultAdminEmail,
      displayName: "Alice Administrator",
      password: adminPassword,
      role: "admin",
      locale,
      theme: "system",
    },
    {
      id: userUuids[1],
      email: "bob.user@example.com",
      displayName: "Bob User",
      password: "Bob@User456!",
      role: "user",
      locale,
      theme: "light",
    },
    {
      id: userUuids[2],
      email: "charlie.dev@example.com",
      displayName: "Charlie Developer",
      password: "Charlie@Dev789!",
      role: "user",
      locale,
      theme: "dark",
    },
  ];
}
