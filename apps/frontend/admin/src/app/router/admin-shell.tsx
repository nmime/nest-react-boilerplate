import { useEffect } from 'react';
import { Outlet } from '@tanstack/react-router';
import { observer, useI18n } from '@app/frontend-runtime';
import { UiLoading, UiSection } from '@app/frontend-ui-web';
import { ForbiddenPage } from '../../pages/forbidden';
import { AdminLayout } from '../../widgets/admin-shell';
import { useAdminCurrentPath, useAdminNavigate } from './admin-navigation';
import { useAdminRuntime } from './admin-runtime-context';

/**
 * Root layout route. Gates on the admin session state (loading / forbidden /
 * ready) exactly as the previous hand-rolled shell did, renders `AdminLayout`
 * with `<Outlet/>` when ready, and routes in-app `/admin/...` anchor clicks
 * through the router.
 */
export const AdminShell = observer(function AdminShell() {
  const { t } = useI18n();
  const { state, isSigningOut, onSignOut } = useAdminRuntime();
  const currentPath = useAdminCurrentPath();
  const navigate = useAdminNavigate();

  useEffect(() => {
    const clickHandler = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }
      const anchorTarget = anchor.getAttribute('target');
      if ((anchorTarget && anchorTarget !== '_self') || anchor.hasAttribute('download')) {
        return;
      }
      const href = anchor.getAttribute('href');
      if (!href?.startsWith('/')) {
        return;
      }
      event.preventDefault();
      navigate(href);
    };
    globalThis.document.addEventListener('click', clickHandler);
    return () => {
      globalThis.document.removeEventListener('click', clickHandler);
    };
  }, [navigate]);

  if (state.status === 'loading') {
    return (
      <main id="xr-content">
        <UiSection eyebrow={t('admin.loadingEyebrow')} headingLevel={1} title={t('admin.loadingProfile')}>
          <UiLoading label={t('admin.loadingProfile')} />
        </UiSection>
      </main>
    );
  }

  if (state.status === 'forbidden') {
    return (
      <main id="xr-content">
        <ForbiddenPage reason={state.reason} />
      </main>
    );
  }

  return (
    <AdminLayout access={state.access} currentPath={currentPath} isSigningOut={isSigningOut} onSignOut={onSignOut}>
      <Outlet />
    </AdminLayout>
  );
});
