import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { FrontendI18nProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { landingFrontendTranslations } from '@app/frontend-feature-landing-i18n';
import { LandingPage } from '../src/pages/landing';
import landingStyles from '../src/app/styles/global.css?inline';

const LandingHomeComposition = () => (
  <FrontendStateProvider>
    <FrontendI18nProvider initialLocale="en" translations={landingFrontendTranslations}>
      <LandingPage />
    </FrontendI18nProvider>
  </FrontendStateProvider>
);

const meta = {
  title: 'Applications/Landing/Home',
  component: LandingHomeComposition,
  tags: ['visual'],
  decorators: [
    (Story) => (
      <>
        <style>{landingStyles}</style>
        <Story />
      </>
    ),
  ],
  parameters: {
    appComposition: true,
    layout: 'fullscreen',
  },
} satisfies Meta<typeof LandingHomeComposition>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { name: 'A focused foundation for your next product.' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Preview user app' })).toHaveAttribute('href', '/app');
    await expect(canvas.getByRole('link', { name: 'Preview admin app' })).toHaveAttribute('href', '/admin');
    document.documentElement.setAttribute('data-visual-ready', 'true');
  },
};
