import type { ReactElement } from 'react';
import type { ApiClientRequestOptions } from '@app/frontend-api-client';
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
import { fallbackTranslate, isUsersRoute, normalizeAdminPath, type AdminProfileState, type Translate } from '../../shared';

export interface AdminRouteRuntime {
  requestOptions?: ApiClientRequestOptions;
}

/**
 * RBAC route matrix: single source of truth mapping a normalized admin path +
 * access state to the guarded page (or ForbiddenPage). Shared by the router's
 * per-path route components and by tests that assert the matrix directly, so
 * the guard decisions never drift between the two.
 */
/* eslint-disable sonarjs/cognitive-complexity -- route matrix is explicit for RBAC auditability. */
function renderReadyAdminRoute(
  path: string,
  state: Extract<AdminProfileState, { status: 'ready' }>,
  t: Translate,
  runtime: AdminRouteRuntime,
): ReactElement {
  const routePath = normalizeAdminPath(path);
  if (routePath === '/' || routePath === '/dashboard') {
    return state.access.canReadDashboard ? (
      <DashboardPage access={state.access} requestOptions={runtime.requestOptions} />
    ) : (
      <ForbiddenPage reason={t('admin.permission.dashboardMissing')} />
    );
  }
  if (isUsersRoute(routePath)) {
    return state.access.canReadUsers ? (
      <UsersPage access={state.access} currentPath={path} requestOptions={runtime.requestOptions} />
    ) : (
      <ForbiddenPage reason={t('admin.permission.usersMissing')} />
    );
  }
  if (routePath === '/roles') {
    return state.access.canReadRoles ? (
      <RolesPage access={state.access} requestOptions={runtime.requestOptions} />
    ) : (
      <ForbiddenPage reason={t('admin.permission.rolesMissing')} />
    );
  }
  if (routePath === '/audit' || routePath.startsWith('/audit/')) {
    return state.access.canReadAudit ? (
      <AuditPage currentPath={path} requestOptions={runtime.requestOptions} />
    ) : (
      <ForbiddenPage reason={t('admin.permission.auditMissing')} />
    );
  }
  if (routePath === '/auth/login-analytics') {
    return state.access.canReadAuthLoginAnalytics ? (
      <AuthLoginAnalyticsPage currentPath={path} requestOptions={runtime.requestOptions} />
    ) : (
      <ForbiddenPage reason={t('admin.permission.authLoginAnalyticsMissing')} />
    );
  }
  if (routePath === '/profile') {
    return state.access.canReadProfile ? (
      <ProfilePage payload={state.payload} />
    ) : (
      <ForbiddenPage reason={t('admin.permission.profileMissing')} />
    );
  }
  if (routePath === '/settings/errors') {
    return state.access.canReadSettings ? (
      <ProblemPresentationsPage access={state.access} requestOptions={runtime.requestOptions} />
    ) : (
      <ForbiddenPage reason={t('admin.permission.settingsMissing')} />
    );
  }
  if (routePath === '/settings/feature-flags') {
    return state.access.canReadFeatureFlags ? (
      <FeatureFlagsPage access={state.access} requestOptions={runtime.requestOptions} />
    ) : (
      <ForbiddenPage reason={t('admin.permission.featureFlagsMissing')} />
    );
  }
  if (routePath === '/notifications/templates') {
    return state.access.canReadNotificationTemplates ? (
      <NotificationTemplatesPage access={state.access} requestOptions={runtime.requestOptions} />
    ) : (
      <ForbiddenPage reason={t('admin.permission.notificationTemplatesMissing')} />
    );
  }
  if (routePath === '/notifications/segments') {
    return state.access.canReadNotificationSegments ? (
      <NotificationSegmentsPage access={state.access} requestOptions={runtime.requestOptions} />
    ) : (
      <ForbiddenPage reason={t('admin.permission.notificationSegmentsMissing')} />
    );
  }
  if (routePath === '/notifications/broadcasts') {
    return state.access.canReadNotificationBroadcasts ? (
      <NotificationBroadcastsPage access={state.access} requestOptions={runtime.requestOptions} />
    ) : (
      <ForbiddenPage reason={t('admin.permission.notificationBroadcastsMissing')} />
    );
  }
  return <NotFoundPage />;
}
/* eslint-enable sonarjs/cognitive-complexity */

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
