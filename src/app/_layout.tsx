import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';
import { AlarmSyncProvider } from '@/lib/alarm-sync-context';
import { MedicinesProvider } from '@/lib/medicines-context';

function buildNavTheme(scheme: 'light' | 'dark'): typeof DefaultTheme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const palette = Colors[scheme];
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.brand,
      background: palette.background,
      card: palette.background,
      text: palette.text,
      border: palette.outline,
    },
  };
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';

  return (
    <ThemeProvider value={buildNavTheme(scheme)}>
      <MedicinesProvider>
        <AlarmSyncProvider>
          <Stack
            screenOptions={{
              headerTitleStyle: { fontFamily: Fonts.rounded, fontWeight: '700' },
              headerShadowVisible: false,
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen
              name="medicine/new"
              options={{ title: 'Novo remédio', presentation: 'modal' }}
            />
            <Stack.Screen
              name="medicine/[id]/edit"
              options={{ title: 'Editar remédio', presentation: 'modal' }}
            />
            <Stack.Screen name="settings" options={{ title: 'Ajustes' }} />
          </Stack>
        </AlarmSyncProvider>
      </MedicinesProvider>
    </ThemeProvider>
  );
}
