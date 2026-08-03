import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { FrontendI18nProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { adminFrontendTranslations } from '@app/frontend-feature-admin-i18n';
import { createAdminAccess } from '../src/entities/admin-session';
import { DashboardPage } from '../src/pages/dashboard';
import { AdminLayout } from '../src/widgets/admin-shell';
import adminStyles from '../src/styles.css?inline';

const access = createAdminAccess({
  subject: 'storybook-admin',
  roles: ['admin'],
  permissions: ['admin:manage:all'],
});

const AdminDashboardComposition = () => (
  <FrontendStateProvider>
    <FrontendI18nProvider initialLocale="en" translations={adminFrontendTranslations}>
      <AdminLayout access={access} currentPath="/admin">
        <DashboardPage access={access} />
      </AdminLayout>
    </FrontendI18nProvider>
  </FrontendStateProvider>
);

const meta = {
  title: 'Applications/Admin/Dashboard',
  component: AdminDashboardComposition,
  tags: ['visual'],
  decorators: [
    (Story) => (
      <>
        <style>{adminStyles}</style>
        <Story />
      </>
    ),
  ],
  parameters: {
    appComposition: true,
    layout: 'fullscreen',
  },
} satisfies Meta<typeof AdminDashboardComposition>;

export default meta;

type Story = StoryObj<typeof meta>;

// The console collapses its sidebar into a drawer at this width (see the
// `max-width: 800px` block in the shared stylesheet), so the sidebar tree simply
// does not exist on the matrix's Pixel 7 and iPhone 15 projects. Asserting it
// unconditionally left the play function unable to complete there, which meant
// `data-visual-ready` was never set and both mobile projects timed out — the
// mobile half of the visual matrix could not pass regardless of the screenshots.
const sidebarBreakpointPx = 800;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible();

    if (window.innerWidth > sidebarBreakpointPx) {
      await expect(canvas.getByRole('button', { name: 'Users' })).toHaveAttribute('aria-expanded', 'false');
      await expect(
        canvas
          .getAllByRole('link', { name: /Dashboard/u })
          .some((link) => link.getAttribute('aria-current') === 'page'),
      ).toBe(true);
    } else {
      // The drawer is closed on load; only its trigger should be reachable.
      await expect(canvas.getByRole('button', { name: 'Open navigation' })).toBeVisible();
      await expect(canvas.queryByRole('button', { name: 'Users' })).toBeNull();
    }

    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
    document.documentElement.setAttribute('data-visual-ready', 'true');
  },
};
