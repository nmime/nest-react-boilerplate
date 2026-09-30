// @requirements REQ-FRONTEND-SSR-007
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FrontendI18nProvider } from '@app/frontend-runtime';
import { userFrontendTranslations } from '@app/frontend-feature-user-i18n';
import { Page } from './+Page';

const context = vi.hoisted(() => ({ is404: true, abortReason: 'private database exception' }));
vi.mock('vike-react/usePageContext', () => ({ usePageContext: () => context }));
afterEach(cleanup);

describe('site safe error recovery', () => {
  it.each([true, false])('renders a safe localized error with a home recovery link, is404=%s', (is404) => {
    context.is404 = is404;
    render(
      <FrontendI18nProvider initialLocale="en" translations={userFrontendTranslations}>
        <Page />
      </FrontendI18nProvider>,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(is404 ? 'Not Found' : 'Internal Server Error');
    expect(screen.getByRole('link').getAttribute('href')).toBe('/');
    expect(document.body.textContent).not.toContain(context.abortReason);
    expect(document.body.textContent).not.toContain('errors.');
  });

  it('uses the requested locale for the rendered error', () => {
    context.is404 = true;
    const { unmount } = render(
      <FrontendI18nProvider initialLocale="en" translations={userFrontendTranslations}>
        <Page />
      </FrontendI18nProvider>,
    );
    const english = screen.getByRole('heading', { level: 1 }).textContent;
    unmount();
    render(
      <FrontendI18nProvider initialLocale="ru" translations={userFrontendTranslations}>
        <Page />
      </FrontendI18nProvider>,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toBe(english);
  });
});
