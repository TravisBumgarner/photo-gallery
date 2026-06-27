import { Slot } from 'expo-router';
import { useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Spinner, TamaguiProvider, YStack } from 'tamagui';
import { tamaguiConfig } from '../../tamagui.config';
import BottomBar from '../components/BottomBar';
import { AuthProvider, useAuth } from '../lib/auth';
import { BottomBarProvider } from '../lib/bottomBar';

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
      <BottomBar />
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
            <BottomBarProvider>
              <AuthGate />
            </BottomBarProvider>
          </AuthProvider>
        </TamaguiProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
