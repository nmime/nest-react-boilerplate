import type { ReactElement } from 'react';
import type { ApiClientRequestOptions } from '@app/frontend-api-client';
import type { AdminAccessPolicy } from '@app/frontend-feature-admin-shared';
import { UiLoading, UiSection } from '@app/frontend-ui-web';
import { AuditPage } from '../../pages/audit';
import { AuthLoginAnalyticsPage } from '../../pages/auth-login-analytics';
import { DashboardPage } from '../../pages/dashboard';
import { FeatureFlagsPage } from '../../pages/feature-flags';
import { ForbiddenPage } from '../../pages/forbidden';
import { NotFoundPage } from '../../pages/not-found';
import { NotificationBroadcastsPage } from '../../pages/notification-broadcasts';
import { NotificationSegmentsPage } from '../../pages/notification-segments';
import { NotificationTemplatesPage } from '../../pages/notification-templates';
import { ProblemPresentationsPage } from '../../pages/problem-presentations';
import { ProfilePage } from '../../pages/profile';
import { RolesPage } from '../../pages/roles';
import { UsersPage } from '../../pages/users';
import {
  fallbackTranslate,
  findAdminRoute,
  type AdminProfilePayload,
  type AdminProfileState,
  type AdminRouteId,
  type Translate,
} from '../../shared';

export interface AdminRouteRuntime {
  requestOptions?: ApiClientRequestOptions;
}

export interface AdminRouteContext {
  access: AdminAccessPolicy;
  /** Full browser path including the `/admin` prefix and query string. */
  currentPath: string;
  payload: AdminProfilePayload;
  requestOptions?: ApiClientRequestOptions;
}

/**
 * The page behind each route descriptor. Keying by `AdminRouteId` makes the
 * registry and this record mutually exhaustive: a descriptor without a page (or
 * a page without a descriptor) fails to compile, so a product adding a route
 * cannot end up with an unreachable page or an unrendered URL.
 */
export const adminRoutePages: Record<AdminRouteId, (context: AdminRouteContext) => ReactElement> = {
  audit: ({ currentPath, requestOptions }) => <AuditPage currentPath={currentPath} requestOptions={requestOptions} />,
  'auth-login-analytics': ({ currentPath, requestOptions }) => (
    <AuthLoginAnalyticsPage currentPath={currentPath} requestOptions={requestOptions} />
  ),
  dashboard: ({ access, requestOptions }) => <DashboardPage access={access} requestOptions={requestOptions} />,
  'feature-flags': ({ access, requestOptions }) => <FeatureFlagsPage access={access} requestOptions={requestOptions} />,
  'notification-broadcasts': ({ access, requestOptions }) => (
    <NotificationBroadcastsPage access={access} requestOptions={requestOptions} />
  ),
  'notification-segments': ({ access, requestOptions }) => (
    <NotificationSegmentsPage access={access} requestOptions={requestOptions} />
  ),
  'notification-templates': ({ access, requestOptions }) => (
    <NotificationTemplatesPage access={access} requestOptions={requestOptions} />
  ),
  'problem-presentations': ({ access, requestOptions }) => (
    <ProblemPresentationsPage access={access} requestOptions={requestOptions} />
  ),
  profile: ({ payload }) => <ProfilePage payload={payload} />,
  roles: ({ access, requestOptions }) => <RolesPage access={access} requestOptions={requestOptions} />,
  users: ({ access, currentPath, requestOptions }) => (
    <UsersPage access={access} currentPath={currentPath} requestOptions={requestOptions} />
  ),
};

/**
 * RBAC route matrix. The guard is the descriptor's own `access` predicate — the
 * same one the sidebar calls — so a visible nav entry and a reachable page can
 * never disagree.
 */
function renderReadyAdminRoute(
  path: string,
  state: Extract<AdminProfileState, { status: 'ready' }>,
  t: Translate,
  runtime: AdminRouteRuntime,
): ReactElement {
  const route = findAdminRoute(path);
  if (!route) {
    return <NotFoundPage />;
  }
  if (!route.access(state.access)) {
    return <ForbiddenPage reason={t(route.deniedReason)} />;
  }
  return adminRoutePages[route.id]({
    access: state.access,
    currentPath: path,
    payload: state.payload,
    requestOptions: runtime.requestOptions,
  });
}

export function renderAdminRoute(
  path: string,
  state: AdminProfileState,
  t: Translate = fallbackTranslate,
  runtime: AdminRouteRuntime = {},
): ReactElement {
  if (state.status === 'loading') {
    return (
      <UiSection eyebrow={t('admin.loadingEyebrow')} headingLevel={1} title={t('admin.loadingProfile')}>
        <UiLoading label={t('admin.loadingProfile')} />
      </UiSection>
    );
  }
  if (state.status === 'forbidden') {
    return <ForbiddenPage reason={state.reason} />;
  }
  return renderReadyAdminRoute(path, state, t, runtime);
}
