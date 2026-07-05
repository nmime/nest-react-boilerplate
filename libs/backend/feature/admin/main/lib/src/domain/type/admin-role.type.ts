export interface AdminRoleView {
  readonly id: string;
  readonly role: string;
  readonly label: string;
  readonly description: string;
  readonly isSystem: boolean;
  readonly permissions: string[];
}

export interface AdminRolePermissionView {
  readonly permission: string;
  readonly resource: string;
  readonly action: string;
  readonly description: string;
}

export interface AdminRbacCatalog {
  readonly resources: string[];
  readonly roles: AdminRoleView[];
  readonly permissions: AdminRolePermissionView[];
  readonly assignableRoles: string[];
  readonly assignablePermissions: string[];
}
