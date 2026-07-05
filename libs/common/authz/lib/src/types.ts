// Framework-neutral RBAC/ACL primitives. This module is deliberately free of
// CASL, NestJS, MikroORM, and DOM references so both the backend and frontend
// runtimes can import the shared permission catalog and role matrix.

export type RoleKey = "user" | "admin";

export interface PermissionDefinition {
  readonly key: string;
  readonly resource: string;
  readonly action: string;
  readonly description: string;
}

export interface AbilityTarget {
  readonly action: string;
  readonly resource: string;
}
