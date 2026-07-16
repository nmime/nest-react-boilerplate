import type { Locale } from '@app/backend-common-i18n';
// Imported as values for `typeof` catalog shape queries; elided at runtime under
// isolatedModules since they are only referenced in type positions here.
import { adminPermissionCatalog, adminRoleCatalog } from '../factory/admin-permission-catalog.factory';
import type { AdminResource } from './admin-permission.type';

export interface AdminAccessPolicy {
  isAuthenticated: boolean;
  roles: string[];
  permissions: string[];
  canAccessAdmin: boolean;
  canReadDashboard: boolean;
  canReadProfile: boolean;
  canReadUsers: boolean;
  canUpdateUserStatus: boolean;
  canUpdateUserAccessPolicy: boolean;
  canReadRoles: boolean;
  canReadAudit: boolean;
  canReadSettings: boolean;
  canUpdateSettings: boolean;
}

export interface AdminProfileView {
  id: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  locale?: Locale;
  roles: string[];
  permissions: string[];
}

export interface AdminRbacCatalogView {
  resources: readonly AdminResource[];
  roles: typeof adminRoleCatalog;
  permissions: typeof adminPermissionCatalog;
  assignableRoles: readonly string[];
  assignablePermissions: readonly string[];
}
