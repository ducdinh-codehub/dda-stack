import React from 'react';
import { Stack } from 'expo-router';
import { AppProviders } from '../src/providers/AppProviders';

// Root layout: every route renders inside AppProviders. A Stack sits on top of
// the tabs so screens outside the tab bar (details, modals) can be pushed —
// add them as files next to (tabs)/, e.g. app/settings.tsx.
export default function RootLayout() {
  return (
    <AppProviders>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </AppProviders>
  );
}
