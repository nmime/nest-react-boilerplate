import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FrontendI18nProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { UiAdminConsole } from './admin-console';

const navItems = [
  {
    detail: 'Review service signals',
    group: 'Operations',
    href: '/admin',
    isCurrent: true,
    label: 'Dashboard',
  },
  {
    detail: 'Review access',
    group: 'Operations',
    href: '/admin/users',
    label: 'Users',
  },
  {
    detail: 'Review templates',
    group: 'Messaging',
    href: '/admin/notifications/templates',
    label: 'Templates',
  },
] as const;

const nestedNavItems = [
  {
    children: [
      {
        href: '/admin/notifications/templates',
        isCurrent: true,
        label: 'Templates',
      },
      {
        href: '/admin/notifications/broadcasts',
        label: 'Broadcasts',
      },
    ],
    group: 'Messaging',
    icon: 'messaging',
    label: 'Notifications',
  },
] as const;

const renderConsole = () =>
  render(
    <FrontendStateProvider>
      <FrontendI18nProvider>
        <UiAdminConsole
          appName="Admin workspace"
          brandDescription="Review secure operations"
          brandHref="/admin"
          breadcrumbLabel="Breadcrumbs"
          breadcrumbs={[{ href: '/admin', label: 'Dashboard' }, { label: 'Users' }]}
          collapseNavigationLabel="Collapse navigation"
          closeNavigationLabel="Close navigation"
          contentLabel="Users"
          expandNavigationLabel="Expand navigation"
          menuLabel="Open navigation"
          navigationLabel="Admin navigation"
          navItems={navItems}
          skipLinkLabel="Skip to content"
        >
          <section>Users content</section>
        </UiAdminConsole>
      </FrontendI18nProvider>
    </FrontendStateProvider>,
  );

describe('UiAdminConsole', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders grouped desktop navigation, landmarks, and breadcrumbs', () => {
    renderConsole();

    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe('#xr-content');
    expect(screen.getByRole('navigation', { name: 'Admin navigation' })).toBeTruthy();
    expect(screen.getByText('Operations')).toBeTruthy();
    expect(screen.getByText('Messaging')).toBeTruthy();
    expect(
      document.querySelector('.xr-admin-console__nav-link[data-current="true"]')?.getAttribute('aria-current'),
    ).toBe('page');
    expect(screen.getByRole('main', { name: 'Users' }).textContent).toContain('Users content');
  });

  it('opens and closes its mobile navigation drawer from controls and Escape', () => {
    renderConsole();

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByRole('dialog', { name: 'Admin navigation' })).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Admin navigation' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Admin navigation' })).getByRole('button'));
    expect(screen.queryByRole('dialog', { name: 'Admin navigation' })).toBeNull();
  });

  it('expands the active navigation branch and collapses the desktop rail', () => {
    render(
      <FrontendStateProvider>
        <FrontendI18nProvider>
          <UiAdminConsole
            appName="Admin workspace"
            brandDescription="Review secure operations"
            brandHref="/admin"
            breadcrumbLabel="Breadcrumbs"
            breadcrumbs={[{ href: '/admin', label: 'Dashboard' }, { label: 'Templates' }]}
            collapseNavigationLabel="Collapse navigation"
            closeNavigationLabel="Close navigation"
            contentLabel="Templates"
            expandNavigationLabel="Expand navigation"
            menuLabel="Open navigation"
            navigationLabel="Admin navigation"
            navItems={nestedNavItems}
            skipLinkLabel="Skip to content"
          >
            <section>Templates content</section>
          </UiAdminConsole>
        </FrontendI18nProvider>
      </FrontendStateProvider>,
    );

    expect(screen.getByRole('button', { name: 'Notifications' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('link', { name: 'Templates' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }));
    expect(document.querySelector('[data-sidebar-collapsed="true"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toBeTruthy();
  });
});
