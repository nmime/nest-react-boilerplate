import { type ReactNode } from 'react';
import { observer, useI18n } from '@app/frontend-runtime';
import { ProductShell, type ProductShellAction } from '@app/frontend-ui-web';
import type { AdminAccess } from '../../entities/admin-session';
import { normalizeAdminPath } from '../../shared';

interface AdminNavItem extends Omit<ProductShellAction, 'isCurrent'> {
  detail: string;
  isCurrent: boolean;
}

export const AdminLayout = observer(function AdminLayout({
  access,
  children,
  currentPath = '/',
}: Readonly<{
  access?: AdminAccess;
  children: ReactNode;
  currentPath?: string;
}>) {
  const { t } = useI18n();
  const path = normalizeAdminPath(currentPath);
  const navItems: AdminNavItem[] = [];

  if (access?.canReadDashboard ?? true) {
    navItems.push({
      href: '/admin',
      isCurrent: path === '/' || path === '/dashboard',
      label: t('admin.action.dashboard'),
      detail: t('admin.dashboard.description'),
    });
  }
  if (access?.canReadUsers) {
    navItems.push({
      href: '/admin/users',
      isCurrent: path.startsWith('/users'),
      label: t('admin.action.users'),
      detail: t('admin.dashboard.card.visibility.description'),
      variant: 'secondary',
    });
  }
  if (access?.canReadRoles) {
    navItems.push({
      href: '/admin/roles',
      isCurrent: path === '/roles',
      label: t('admin.action.roles'),
      detail: t('admin.roles.title'),
      variant: 'secondary',
    });
  }
  if (access?.canReadAudit) {
    navItems.push({
      href: '/admin/audit',
      isCurrent: path === '/audit',
      label: t('admin.action.audit'),
      detail: t('admin.dashboard.summary.recentAuditDetail'),
      variant: 'secondary',
    });
  }
  if (access?.canReadSettings) {
    navItems.push({
      href: '/admin/settings/errors',
      isCurrent: path === '/settings/errors',
      label: t('admin.action.problemPresentations'),
      detail: t('admin.problemPresentations.description'),
      variant: 'secondary',
    });
  }
  if (access?.canReadProfile ?? true) {
    navItems.push({
      href: '/admin/profile',
      isCurrent: path === '/profile',
      label: t('admin.action.profile'),
      detail: t('admin.profile.description'),
      variant: 'secondary',
    });
  }
  const currentItem = navItems.find((item) => item.isCurrent);
  return (
    <ProductShell
      actions={navItems.map((item) => ({
        href: item.href,
        isCurrent: item.isCurrent,
        label: item.label,
        variant: item.isCurrent ? 'primary' : 'secondary',
      }))}
      appName={t('admin.appName')}
      description={t('admin.description')}
      homeHref="/admin"
      eyebrow={t('admin.eyebrow')}
      title={t('admin.title')}
    >
      <div className="admin-shell">
        <aside className="admin-sidebar" aria-label={t('admin.appName')}>
          <div className="admin-sidebar__card">
            <p className="xr-eyebrow">{t('admin.eyebrow')}</p>
            <strong>{t('admin.title')}</strong>
            <span>{t('admin.description')}</span>
          </div>
          <nav className="admin-sidebar__nav" aria-label={t('admin.appName')}>
            {navItems.map((item, index) => (
              <a
                aria-current={item.isCurrent ? 'page' : undefined}
                className="admin-sidebar__link"
                data-current={item.isCurrent ? 'true' : 'false'}
                href={item.href}
                key={item.href}
              >
                <span className="admin-sidebar__indicator" />
                <span className="admin-sidebar__number">{(index + 1).toString().padStart(2, '0')}</span>
                <span className="admin-sidebar__label">{item.label}</span>
                <small>{item.detail}</small>
              </a>
            ))}
          </nav>
        </aside>
        <section aria-label={currentItem?.label ?? t('admin.title')} className="admin-main-panel">
          {children}
        </section>
      </div>
    </ProductShell>
  );
});
