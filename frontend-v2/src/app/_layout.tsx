import { Slot } from 'expo-router';
import { useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Spinner, TamaguiProvider, YStack } from 'tamagui';

import AppMenu from '../components/AppMenu';
import { AuthProvider, useAuth } from '../lib/auth';
import { tamaguiConfig } from '../../tamagui.config';

function AuthGate() {
  const { loading } = useAuth();
  if (loading) {
    return (
      <YStack items="center" justify="center" style={{ flex: 1 }}>
        <Spinner size="large" />
      </YStack>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <Slot />
      <AppMenu />
    </View>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <TamaguiProvider
          config={tamaguiConfig}
          defaultTheme={colorScheme === 'dark' ? 'dark' : 'light'}
        >
          <AuthProvider>
            <AuthGate />
          </AuthProvider>
        </TamaguiProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
