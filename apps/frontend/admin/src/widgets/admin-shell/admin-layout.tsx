import { type ReactNode } from 'react';
import { observer, useI18n } from '@app/frontend-runtime';
import { UiAdminConsole, type UiAdminConsoleNavItem } from '@app/frontend-ui-web';
import type { AdminAccess } from '../../entities/admin-session';
import { normalizeAdminPath } from '../../shared';

type AdminNavItem = UiAdminConsoleNavItem;
type AdminTranslate = ReturnType<typeof useI18n>['t'];

interface ConditionalNavigationItem {
  item: AdminNavItem;
  visible: boolean;
}

const visibleNavigationItems = (items: readonly ConditionalNavigationItem[]): AdminNavItem[] =>
  items.filter(({ visible }) => visible).map(({ item }) => item);

const navigationSection = (
  id: string,
  icon: NonNullable<AdminNavItem['icon']>,
  label: string,
  children: AdminNavItem[],
): AdminNavItem[] => (children.length > 0 ? [{ children, icon, id, label }] : []);

const buildAdminNavigation = ({
  access,
  isSigningOut,
  onSignOut,
  path,
  t,
}: {
  access?: AdminAccess;
  isSigningOut: boolean;
  onSignOut?: () => void;
  path: string;
  t: AdminTranslate;
}): AdminNavItem[] => {
  const users = visibleNavigationItems([
    {
      item: {
        href: '/admin/users',
        icon: 'users',
        isCurrent: path.startsWith('/users'),
        label: t('admin.action.users'),
      },
      visible: Boolean(access?.canReadUsers),
    },
    {
      item: {
        href: '/admin/roles',
        icon: 'roles',
        isCurrent: path === '/roles',
        label: t('admin.action.roles'),
      },
      visible: Boolean(access?.canReadRoles),
    },
    {
      item: {
        href: '/admin/auth/login-analytics',
        icon: 'analytics',
        isCurrent: path === '/auth/login-analytics',
        label: t('admin.action.authLoginAnalytics'),
      },
      visible: Boolean(access?.canReadAuthLoginAnalytics),
    },
  ]);
  const messaging = visibleNavigationItems([
    {
      item: {
        href: '/admin/notifications/templates',
        icon: 'templates',
        isCurrent: path === '/notifications/templates',
        label: t('admin.action.notificationTemplates'),
      },
      visible: Boolean(access?.canReadNotificationTemplates),
    },
    {
      item: {
        href: '/admin/notifications/segments',
        icon: 'segments',
        isCurrent: path === '/notifications/segments',
        label: t('admin.action.notificationSegments'),
      },
      visible: Boolean(access?.canReadNotificationSegments),
    },
    {
      item: {
        href: '/admin/notifications/broadcasts',
        icon: 'broadcasts',
        isCurrent: path === '/notifications/broadcasts',
        label: t('admin.action.notificationBroadcasts'),
      },
      visible: Boolean(access?.canReadNotificationBroadcasts),
    },
  ]);
  const system = visibleNavigationItems([
    {
      item: {
        href: '/admin/settings/feature-flags',
        icon: 'feature-flags',
        isCurrent: path === '/settings/feature-flags',
        label: t('admin.action.featureFlags'),
      },
      visible: Boolean(access?.canReadFeatureFlags),
    },
    {
      item: {
        href: '/admin/settings/errors',
        icon: 'settings',
        isCurrent: path === '/settings/errors',
        label: t('admin.action.problemPresentations'),
      },
      visible: Boolean(access?.canReadSettings),
    },
    {
      item: {
        href: '/admin/audit',
        icon: 'audit',
        isCurrent: path === '/audit' || path.startsWith('/audit/'),
        label: t('admin.action.audit'),
      },
      visible: Boolean(access?.canReadAudit),
    },
    {
      item: {
        href: '/admin/profile',
        icon: 'profile',
        isCurrent: path === '/profile',
        label: t('admin.action.profile'),
      },
      visible: access?.canReadProfile ?? true,
    },
  ]);

  return [
    ...visibleNavigationItems([
      {
        item: {
          href: '/admin',
          icon: 'dashboard',
          isCurrent: path === '/' || path === '/dashboard',
          label: t('admin.action.dashboard'),
        },
        visible: access?.canReadDashboard ?? true,
      },
    ]),
    ...navigationSection('users', 'users', t('admin.navigation.section.users'), users),
    ...navigationSection('messaging', 'messaging', t('admin.navigation.section.messaging'), messaging),
    ...navigationSection('system', 'settings', t('admin.navigation.group.system'), system),
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

const findCurrentNavItem = (items: readonly AdminNavItem[]): AdminNavItem | undefined => {
  for (const item of items) {
    if (item.isCurrent) {
      return item;
    }

    const currentChild = item.children ? findCurrentNavItem(item.children) : undefined;
    if (currentChild) {
      return currentChild;
    }
  }

  return undefined;
};

export const AdminLayout = observer(function AdminLayout({
  access,
  children,
  currentPath = '/',
  isSigningOut = false,
  onSignOut,
}: Readonly<{
  access?: AdminAccess;
  children: ReactNode;
  currentPath?: string;
  isSigningOut?: boolean;
  onSignOut?: () => void;
}>) {
  const { t } = useI18n();
  const path = normalizeAdminPath(currentPath);
  const navItems = buildAdminNavigation({ access, isSigningOut, onSignOut, path, t });
  const currentItem = findCurrentNavItem(navItems);

  return (
    <UiAdminConsole
      appName={t('admin.appName')}
      brandDescription={t('admin.description')}
      brandHref="/admin"
      breadcrumbLabel={t('admin.navigation.breadcrumbs')}
      breadcrumbs={[
        { href: '/admin', label: t('admin.action.dashboard') },
        ...(currentItem && currentItem.href !== '/admin' ? [{ label: currentItem.label }] : []),
      ]}
      className="admin-shell"
      collapseNavigationLabel={t('admin.navigation.collapse')}
      closeNavigationLabel={t('admin.navigation.close')}
      contentLabel={currentItem?.label ?? t('admin.title')}
      expandNavigationLabel={t('admin.navigation.expand')}
      menuLabel={t('admin.navigation.open')}
      navigationLabel={t('admin.navigation.label')}
      navItems={navItems}
      skipLinkLabel={t('admin.navigation.skip')}
    >
      {children}
    </UiAdminConsole>
  );
});
