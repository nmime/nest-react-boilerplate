export interface AssignAuthUserRolesInput {
  userId: string;
  tenantId?: string;
  roleKeys: readonly string[];
  grantedByUserId?: string | null;
}

export interface EffectiveAuthAccess {
  roleKeys: string[];
  permissionKeys: string[];
}
