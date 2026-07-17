import { Slot } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import BottomBar from '../components/BottomBar';
import { AuthProvider, useAuth } from '../lib/auth';
import { BottomBarProvider } from '../lib/bottomBar';
import { useTheme } from '../styles/useTheme';

function AuthGate() {
  const theme = useTheme();
  const { loading } = useAuth();
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.background,
        }}
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Slot />
      <BottomBar />
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <BottomBarProvider>
            <AuthGate />
          </BottomBarProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
