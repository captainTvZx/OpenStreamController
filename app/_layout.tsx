import { DarkTheme, ThemeProvider, type Theme } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useObsStore } from '../src/obs/obsStore';
import { useConnectionStore } from '../src/store/connections';
import { theme } from '../src/ui/theme';

/** Reconnects to the last used computer as soon as storage is ready. */
function useAutoConnect() {
  const hydrated = useConnectionStore((state) => state.hydrated);
  const lastConnectionId = useConnectionStore((state) => state.lastConnectionId);

  useEffect(() => {
    if (!hydrated || !lastConnectionId) return;
    if (useObsStore.getState().phase !== 'idle') return;
    useObsStore
      .getState()
      .connectById(lastConnectionId)
      .catch(() => {
        /* the settings screen shows the failure */
      });
  }, [hydrated, lastConnectionId]);
}

const KEEP_AWAKE_TAG = 'openstreamcontroller';

/**
 * React Navigation paints screen containers, modal backdrops and header
 * surfaces from its own theme, so the app palette has to be handed to it too —
 * otherwise white panels show through during transitions.
 */
const navigationTheme: Theme = {
  ...DarkTheme,
  dark: true,
  colors: {
    ...DarkTheme.colors,
    primary: theme.color.accent,
    background: theme.color.background,
    card: theme.color.surface,
    text: theme.color.text,
    border: theme.color.border,
    notification: theme.color.live,
  },
};

export default function RootLayout() {
  const connected = useObsStore((state) => state.phase === 'connected');

  useAutoConnect();

  // Keep the screen on only while the app is acting as a control surface.
  useEffect(() => {
    if (!connected) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [connected]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.color.background }}>
      <SafeAreaProvider>
        <ThemeProvider value={navigationTheme}>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: theme.color.surface },
              headerTintColor: theme.color.text,
              headerTitleStyle: { fontWeight: '700' },
              headerShadowVisible: false,
              contentStyle: { backgroundColor: theme.color.background },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="connection/[id]"
              options={{ presentation: 'modal', title: 'Connection' }}
            />
            <Stack.Screen name="button/[id]" options={{ presentation: 'modal', title: 'Button' }} />
          </Stack>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
