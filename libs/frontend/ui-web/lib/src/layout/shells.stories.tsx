import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { FrontendI18nProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { UiButton } from '../component/button';
import { UiCard } from '../component/card';
import { UiDataTable } from '../component/admin-table';
import { UiActionGroup, UiShellSurface } from '../component/layout-primitives';
import { UiSection } from '../component/section';
import { UiStatCard } from '../component/stat-card';
import { UiStatusTag } from '../component/status-tag';
import { LanguageSwitcher, ThemeSwitcher } from '../component/switchers';
import { UiAdminConsole, type UiAdminConsoleNavItem } from './admin-console';
import { ProductShell } from './product-shell';

const navItems: UiAdminConsoleNavItem[] = [
  { href: '/admin', icon: 'dashboard', isCurrent: true, label: 'Dashboard' },
  {
    children: [
      { href: '/admin/users', icon: 'users', label: 'Users' },
      { href: '/admin/roles', icon: 'roles', label: 'Roles' },
      { href: '/admin/auth/login-analytics', icon: 'analytics', label: 'Login analytics' },
    ],
    icon: 'users',
    id: 'access',
    label: 'Users and access',
  },
  {
    children: [
      { href: '/admin/notifications/templates', icon: 'templates', label: 'Templates' },
      { href: '/admin/notifications/segments', icon: 'segments', label: 'Segments' },
      { href: '/admin/notifications/broadcasts', icon: 'broadcasts', label: 'Broadcasts' },
    ],
    icon: 'messaging',
    id: 'messaging',
    label: 'Messaging',
  },
  { icon: 'logout', label: 'Sign out', onSelect: () => undefined, tone: 'warning' },
];

const Providers = ({ children }: Readonly<{ children: ReactNode }>) => (
  <FrontendStateProvider>
    <FrontendI18nProvider initialLocale="en" initialTheme="dark">
      {children}
    </FrontendI18nProvider>
  </FrontendStateProvider>
);

const ShellShowcase = () => (
  <Providers>
    <UiAdminConsole
      appName="Admin Console"
      brandDescription="Operations and access management"
      brandHref="/admin"
      breadcrumbLabel="Breadcrumbs"
      breadcrumbs={[{ href: '/admin', label: 'Dashboard' }]}
      collapseNavigationLabel="Collapse navigation"
      closeNavigationLabel="Close navigation"
      contentLabel="Dashboard"
      expandNavigationLabel="Expand navigation"
      menuLabel="Open navigation"
      navigationLabel="Admin navigation"
      navItems={navItems}
      skipLinkLabel="Skip to content"
    >
      <UiSection eyebrow="Operations" title="Dashboard">
        <div className="xr-stat-grid">
          <UiStatCard detail="All tenant accounts" label="Total users" value="12,840" />
          <UiStatCard detail="Active in the last 30 days" label="Active users" value="11,906" />
          <UiStatCard detail="Access changes awaiting review" label="Pending reviews" value="18" />
        </div>
        <UiCard title="Recent access changes">
          <UiDataTable
            rowKey={(row) => row.id}
            rows={[
              { actor: 'Ada Operator', id: '1', resource: 'Operations role', status: 'Applied' },
              { actor: 'Grace Reviewer', id: '2', resource: 'Finance policy', status: 'Pending' },
            ]}
            columns={[
              { header: 'Actor', id: 'actor', render: (row) => row.actor },
              { header: 'Resource', id: 'resource', render: (row) => row.resource },
              {
                header: 'Status',
                id: 'status',
                render: (row) => (
                  <UiStatusTag label={row.status} tone={row.status === 'Applied' ? 'success' : 'warning'} />
                ),
              },
            ]}
          />
        </UiCard>
        <UiShellSurface>
          <p>Shared responsive console shell with grouped navigation and compact operator actions.</p>
          <UiActionGroup>
            <UiButton>Primary action</UiButton>
            <UiButton variant="secondary">Secondary action</UiButton>
          </UiActionGroup>
        </UiShellSurface>
      </UiSection>
    </UiAdminConsole>
  </Providers>
);

const meta = {
  title: 'Layouts/Application shells',
  component: ShellShowcase,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ShellShowcase>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AdminConsole: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Collapse navigation' }));
    await expect(canvas.getByRole('button', { name: 'Expand navigation' })).toBeVisible();
  },
};

export const ProductApplication: Story = {
  render: () => (
    <Providers>
      <ProductShell
        actions={[
          { href: '/profile', label: 'Profile', variant: 'primary' },
          { href: '/settings', label: 'Settings', variant: 'secondary' },
        ]}
        appName="Workspace"
        description="A responsive authenticated application shell."
        eyebrow="Account"
        status="Online"
        statusTone="success"
        title="Manage your workspace"
      >
        <UiSection title="Content region">Product content</UiSection>
      </ProductShell>
    </Providers>
  ),
};

export const LocaleAndThemeControls: Story = {
  render: () => (
    <Providers>
      <UiShellSurface>
        <UiSection eyebrow="Preferences" title="Locale and theme controls">
          <UiActionGroup>
            <LanguageSwitcher />
            <LanguageSwitcher variant="menu" />
            <ThemeSwitcher />
            <ThemeSwitcher variant="menu" />
          </UiActionGroup>
        </UiSection>
      </UiShellSurface>
    </Providers>
  ),
};
