import type { ReactNode } from 'react';
import { ApiClientProvider } from '@app/frontend-api-client';
import { FrontendI18nProvider, FrontendQueryProvider, FrontendStateProvider, observer } from '@app/frontend-runtime';
import { useUserPreferenceControls } from '@app/frontend-feature-user-preferences';
import { userFrontendTranslations } from '@app/frontend-feature-user-i18n';
import { MobileRuntimeProvider } from '../shared';

/**
 * Drives locale/theme from the shared `useUserPreferenceControls` hook — the
 * exact model the web app uses — and wires it into the i18n provider, proving
 * the feature logic is reused across web and native. The persistence call flows
 * through the shared API client; when offline/unauthenticated it degrades to a
 * local-only change (the hook swallows the failure).
 */
const MobilePreferencesBridge = observer(function MobilePreferencesBridge({
  children,
}: {
  readonly children: ReactNode;
}) {
  const preferences = useUserPreferenceControls();

  return (
    <FrontendI18nProvider
      onLocaleChange={preferences.persistUserLocale}
      onThemeChange={preferences.persistUserTheme}
      translations={userFrontendTranslations}
      userLocale={preferences.userLocale}
      userTheme={preferences.userTheme}
    >
      <MobileRuntimeProvider
        value={{
          applyUserLocale: preferences.applyUserLocale,
          persistUserLocale: preferences.persistUserLocale,
          userLocale: preferences.userLocale,
        }}
      >
        {children}
      </MobileRuntimeProvider>
    </FrontendI18nProvider>
  );
});

/** Composition root for the native app: state, API client, query cache, i18n. */
export function MobileAppProviders({ children }: { readonly children: ReactNode }) {
  return (
    <FrontendStateProvider>
      <ApiClientProvider baseUrls={{ admin: '', auth: '', user: '' }}>
        <FrontendQueryProvider>
          <MobilePreferencesBridge>{children}</MobilePreferencesBridge>
        </FrontendQueryProvider>
      </ApiClientProvider>
    </FrontendStateProvider>
  );
}
