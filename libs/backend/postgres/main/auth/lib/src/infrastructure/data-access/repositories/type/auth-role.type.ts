import type { AuthRoleEntity } from "../../entities";

export interface AuthRoleRepositoryError {
  code: "repository_error";
  message: string;
}

export interface AuthRoleWithPermissions {
  role: AuthRoleEntity;
  permissionKeys: string[];
}

export interface CreateAuthRoleInput {
  tenantId?: string;
  key: string;
  label?: string;
  description?: string;
  isSystem?: boolean;
}

export interface UpdateAuthRoleInput {
  label?: string;
  description?: string;
}
