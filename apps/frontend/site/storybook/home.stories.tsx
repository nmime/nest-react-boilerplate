import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { FrontendI18nProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { userFrontendTranslations } from '@app/frontend-feature-user-i18n';
import { Page } from '../pages/index/+Page';
import siteStyles from '../styles/site.css?inline';

const SiteHomeComposition = () => (
  <FrontendStateProvider>
    <FrontendI18nProvider initialLocale="en" translations={userFrontendTranslations}>
      <main className="site-shell">
        <Page />
      </main>
    </FrontendI18nProvider>
  </FrontendStateProvider>
);

const meta = {
  title: 'Applications/Site/Home',
  component: SiteHomeComposition,
  tags: ['visual'],
  decorators: [
    (Story) => (
      <>
        <style>{siteStyles}</style>
        <Story />
      </>
    ),
  ],
  parameters: {
    appComposition: true,
    layout: 'fullscreen',
  },
} satisfies Meta<typeof SiteHomeComposition>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole('heading', { name: 'A dependable home for the pages people return to.' }),
    ).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Open account' })).toHaveAttribute('href', '/app');
    await expect(canvas.getByRole('link', { name: 'View public landing' })).toHaveAttribute('href', '/');
    document.documentElement.setAttribute('data-visual-ready', 'true');
  },
};
