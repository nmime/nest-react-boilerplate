import type { PermissionKey } from '@app/common-authz';
// Imported as values because they are referenced in `typeof` type queries; with
// isolatedModules these type-only uses are elided from the emitted module.
import { UserProfileReadPermission } from '@app/common-authz';
import { adminActions, adminResources, AdminAllResource } from '../const';

export type AdminAction = (typeof adminActions)[number];
export type AdminResource = (typeof adminResources)[number];
export type AdminSubject = AdminResource | typeof AdminAllResource;

export interface AdminPrincipalClaims {
  subject?: string;
  roles?: readonly string[];
  permissions?: readonly string[];
}

export type AdminPermission = Exclude<PermissionKey, typeof UserProfileReadPermission>;
