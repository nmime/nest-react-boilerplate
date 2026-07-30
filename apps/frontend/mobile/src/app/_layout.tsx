import 'react-native-gesture-handler';

import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TamaguiProvider, Theme, nativeTamaguiConfig } from '@app/frontend-ui-native';
import { MobileAppProviders } from './mobile-app-providers';

export default function MobileRootLayout() {
  return (
    <MobileAppProviders>
      <TamaguiProvider config={nativeTamaguiConfig} defaultTheme="light">
        <Theme name="light">
          <SafeAreaProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </SafeAreaProvider>
        </Theme>
      </TamaguiProvider>
    </MobileAppProviders>
  );
}
