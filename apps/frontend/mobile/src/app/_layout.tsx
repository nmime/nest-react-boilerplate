import 'react-native-gesture-handler';

import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TamaguiProvider, Theme, nativeTamaguiConfig } from '@app/frontend-ui-native';
import { FrontendI18nProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { userFrontendTranslations } from '@app/frontend-feature-user-i18n';

export default function MobileRootLayout() {
  return (
    <FrontendStateProvider>
      <FrontendI18nProvider translations={userFrontendTranslations}>
        <TamaguiProvider config={nativeTamaguiConfig} defaultTheme="light">
          <Theme name="light">
            <SafeAreaProvider>
              <Stack screenOptions={{ headerShown: false }} />
            </SafeAreaProvider>
          </Theme>
        </TamaguiProvider>
      </FrontendI18nProvider>
    </FrontendStateProvider>
  );
}
