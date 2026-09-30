import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { ApiClientProvider } from '@app/frontend-api-client';
import { FrontendI18nProvider, FrontendQueryProvider, FrontendStateProvider, observer } from '@app/frontend-runtime';
import { useUserPreferenceControls } from '@app/frontend-feature-user-preferences';
import { userFrontendTranslations } from '@app/frontend-feature-user-i18n';
import { MobileRuntimeProvider, readMobileApiEnvironment, resolveMobileApiConfig } from '../shared';

/**
 * Drives locale/theme from the shared `useUserPreferenceControls` hook — the
 * model the web app uses. Unconfigured native shells keep changes local;
 * configured requests use the selected origins and product-owned session transport.
 */
const MobilePreferencesBridge = observer(function MobilePreferencesBridge({
  children,
  persistenceEnabled,
}: {
  readonly children: ReactNode;
  readonly persistenceEnabled: boolean;
}) {
  const preferences = useUserPreferenceControls({ persistenceEnabled });

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
export function MobileAppProviders({
  children,
  sessionFetch,
}: {
  readonly children: ReactNode;
  readonly sessionFetch?: typeof fetch;
}) {
  const apiConfig = resolveMobileApiConfig(Platform.OS, readMobileApiEnvironment(), sessionFetch);
  return (
    <FrontendStateProvider>
      <ApiClientProvider {...(apiConfig ?? { baseUrls: { admin: '', auth: '', user: '' }, credentials: 'omit' })}>
        <FrontendQueryProvider>
          <MobilePreferencesBridge persistenceEnabled={apiConfig !== null}>{children}</MobilePreferencesBridge>
        </FrontendQueryProvider>
      </ApiClientProvider>
    </FrontendStateProvider>
  );
}
