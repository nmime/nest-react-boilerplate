import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { FrontendI18nProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { userFrontendTranslations } from '@app/frontend-feature-user-i18n';
import { createUserRouter } from '../src/app/router/user-route-tree';
import userStyles from '../src/styles.css?inline';

const UserHomeComposition = () => {
  const router = createUserRouter(createMemoryHistory({ initialEntries: ['/'] }));

  return (
    <FrontendStateProvider>
      <FrontendI18nProvider initialLocale="en" translations={userFrontendTranslations}>
        <RouterProvider router={router} />
      </FrontendI18nProvider>
    </FrontendStateProvider>
  );
};

const meta = {
  title: 'Applications/User/Home',
  component: UserHomeComposition,
  tags: ['visual'],
  decorators: [
    (Story) => (
      <>
        <style>{userStyles}</style>
        <Story />
      </>
    ),
  ],
  parameters: {
    appComposition: true,
    layout: 'fullscreen',
  },
} satisfies Meta<typeof UserHomeComposition>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { name: 'Account essentials' })).toBeVisible();
    await expect(
      canvas.getAllByRole('link', { name: 'Home' }).some((link) => link.getAttribute('aria-current') === 'page'),
    ).toBe(true);
    await expect(canvas.getAllByRole('link', { name: 'Profile' })).not.toHaveLength(0);
    document.documentElement.setAttribute('data-visual-ready', 'true');
  },
};
