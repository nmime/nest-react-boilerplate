import type { TranslationKey } from '@app/frontend-runtime';
import type { UiAdminConsoleNavItem } from '@app/frontend-ui-web';
import type { AdminAccessPolicy } from '@app/frontend-feature-admin-shared';
import { normalizeAdminPath, type Translate } from './admin-path';

/** Admin URLs are reverse-proxied under `/admin`; the router uses it as basepath. */
export const adminBasepath = '/admin';

export type AdminNavSectionId = 'users' | 'messaging' | 'system';

export interface AdminRouteNavEntry {
  readonly icon: NonNullable<UiAdminConsoleNavItem['icon']>;
  readonly label: TranslationKey;
  /** Omitted for top-level entries such as the dashboard. */
  readonly section?: AdminNavSectionId;
}

export interface AdminRouteDescriptor {
  readonly id: string;
  /** Router paths this page owns; the first is its canonical URL. */
  readonly paths: readonly [string, ...string[]];
  /** Overrides the default exact match, for prefix routes such as `/audit/...`. */
  readonly matches?: (routePath: string) => boolean;
  /**
   * The one permission predicate. The RBAC matrix and the sidebar both call it,
   * so a page can never be reachable while its nav entry is hidden (or vice versa).
   */
  readonly access: (access?: AdminAccessPolicy) => boolean;
  readonly deniedReason: TranslationKey;
  readonly nav?: AdminRouteNavEntry;
}

/**
 * Every admin page, once. Path, RBAC guard, denial copy, nav placement and
 * breadcrumb label live on one descriptor; the router tree, the route matrix and
 * the sidebar are all derived from this list, and `adminRoutePages` is keyed by
 * `id` so a descriptor without a page is a compile error.
 */
export const adminRouteDescriptors = [
  {
    access: (access) => access?.canReadDashboard ?? true,
    deniedReason: 'admin.permission.dashboardMissing',
    id: 'dashboard',
    nav: { icon: 'dashboard', label: 'admin.action.dashboard' },
    paths: ['/', '/dashboard'],
  },
  {
    access: (access) => Boolean(access?.canReadUsers),
    deniedReason: 'admin.permission.usersMissing',
    id: 'users',
    matches: (routePath) => routePath === '/users' || routePath.startsWith('/users/'),
    nav: { icon: 'users', label: 'admin.action.users', section: 'users' },
    paths: ['/users', '/users/$userId'],
  },
  {
    access: (access) => Boolean(access?.canReadRoles),
    deniedReason: 'admin.permission.rolesMissing',
    id: 'roles',
    nav: { icon: 'roles', label: 'admin.action.roles', section: 'users' },
    paths: ['/roles'],
  },
  {
    access: (access) => Boolean(access?.canReadAuthLoginAnalytics),
    deniedReason: 'admin.permission.authLoginAnalyticsMissing',
    id: 'auth-login-analytics',
    nav: { icon: 'analytics', label: 'admin.action.authLoginAnalytics', section: 'users' },
    paths: ['/auth/login-analytics'],
  },
  {
    access: (access) => Boolean(access?.canReadNotificationTemplates),
    deniedReason: 'admin.permission.notificationTemplatesMissing',
    id: 'notification-templates',
    nav: { icon: 'templates', label: 'admin.action.notificationTemplates', section: 'messaging' },
    paths: ['/notifications/templates'],
  },
  {
    access: (access) => Boolean(access?.canReadNotificationSegments),
    deniedReason: 'admin.permission.notificationSegmentsMissing',
    id: 'notification-segments',
    nav: { icon: 'segments', label: 'admin.action.notificationSegments', section: 'messaging' },
    paths: ['/notifications/segments'],
  },
  {
    access: (access) => Boolean(access?.canReadNotificationBroadcasts),
    deniedReason: 'admin.permission.notificationBroadcastsMissing',
    id: 'notification-broadcasts',
    nav: { icon: 'broadcasts', label: 'admin.action.notificationBroadcasts', section: 'messaging' },
    paths: ['/notifications/broadcasts'],
  },
  {
    access: (access) => Boolean(access?.canReadFeatureFlags),
    deniedReason: 'admin.permission.featureFlagsMissing',
    id: 'feature-flags',
    nav: { icon: 'feature-flags', label: 'admin.action.featureFlags', section: 'system' },
    paths: ['/settings/feature-flags'],
  },
  {
    access: (access) => Boolean(access?.canReadSettings),
    deniedReason: 'admin.permission.settingsMissing',
    id: 'problem-presentations',
    nav: { icon: 'settings', label: 'admin.action.problemPresentations', section: 'system' },
    paths: ['/settings/errors'],
  },
  {
    access: (access) => Boolean(access?.canReadAudit),
    deniedReason: 'admin.permission.auditMissing',
    id: 'audit',
    matches: (routePath) => routePath === '/audit' || routePath.startsWith('/audit/'),
    nav: { icon: 'audit', label: 'admin.action.audit', section: 'system' },
    paths: ['/audit', '/audit/$'],
  },
  {
    access: (access) => access?.canReadProfile ?? true,
    deniedReason: 'admin.permission.profileMissing',
    id: 'profile',
    nav: { icon: 'profile', label: 'admin.action.profile', section: 'system' },
    paths: ['/profile'],
  },
] as const satisfies readonly AdminRouteDescriptor[];

export type AdminRouteEntry = (typeof adminRouteDescriptors)[number];
export type AdminRouteId = AdminRouteEntry['id'];

/** Browser href for a route, including the reverse-proxy basepath. */
export const adminRouteHref = (route: AdminRouteDescriptor): string =>
  route.paths[0] === '/' ? adminBasepath : `${adminBasepath}${route.paths[0]}`;

const routeMatches = (route: AdminRouteDescriptor, routePath: string): boolean =>
  route.matches ? route.matches(routePath) : route.paths.includes(routePath);

/** Descriptor owning `path` (with or without the `/admin` prefix), if any. */
export const findAdminRoute = (path: string): AdminRouteEntry | undefined => {
  const routePath = normalizeAdminPath(path);
  return adminRouteDescriptors.find((route) => routeMatches(route, routePath));
};

const navSections = [
  { icon: 'users', id: 'users', label: 'admin.navigation.section.users' },
  { icon: 'messaging', id: 'messaging', label: 'admin.navigation.section.messaging' },
  { icon: 'settings', id: 'system', label: 'admin.navigation.group.system' },
] as const satisfies readonly {
  icon: NonNullable<UiAdminConsoleNavItem['icon']>;
  id: AdminNavSectionId;
  label: TranslationKey;
}[];

export interface AdminNavigationInput {
  access?: AdminAccessPolicy;
  isSigningOut?: boolean;
  onSignOut?: () => void;
  path: string;
  t: Translate;
}

const navItemsForSection = (
  section: AdminNavSectionId | undefined,
  { access, path, t }: AdminNavigationInput,
): UiAdminConsoleNavItem[] =>
  adminRouteDescriptors.flatMap((route) => {
    const nav = route.nav as AdminRouteNavEntry | undefined;
    if (!nav || nav.section !== section || !route.access(access)) {
      return [];
    }
    return [
      {
        href: adminRouteHref(route),
        icon: nav.icon,
        isCurrent: routeMatches(route, normalizeAdminPath(path)),
        label: t(nav.label),
      },
    ];
  });

/**
 * Sidebar derived from the route registry: an entry exists only where its own
 * route grants access, and its `isCurrent` uses the same matcher the router does.
 */
export const adminNavigationItems = (input: AdminNavigationInput): UiAdminConsoleNavItem[] => {
  const { isSigningOut = false, onSignOut, t } = input;

  return [
    ...navItemsForSection(undefined, input),
    ...navSections.flatMap(({ icon, id, label }) => {
      const children = navItemsForSection(id, input);
      return children.length > 0 ? [{ children, icon, id, label: t(label) }] : [];
    }),
    ...(onSignOut
      ? [
          {
            disabled: isSigningOut,
            icon: 'logout' as const,
            id: 'sign-out',
            label: t('admin.action.signOut'),
            onSelect: onSignOut,
            tone: 'warning' as const,
          },
        ]
      : []),
  ];
};
