import React, { Suspense, type ComponentType } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { miniAppLoaders } from './loaders';

// The header and tab bar already pad the top and bottom — this library's
// SafeAreaView uses the window's insets, so padding those edges again would
// double the gap.
const SCREEN_EDGES = ['left', 'right'] as const;

/**
 * Builds the tab screen for one mini-app. Its exposed screen is loaded over
 * the network via Module Federation — see `remotes` in rspack.config.mjs and
 * each sub-app's `exposes`. The sub-app must be running (its dev server, or a
 * deployed bundle) for this to resolve.
 *
 * Call this once per mini-app at module level, never during render — each
 * call creates a new React.lazy component.
 */
export function createMiniAppScreen(name: string): ComponentType {
  const load = miniAppLoaders[name];
  if (!load) {
    // miniapps.json lists it, but loaders.ts wasn't regenerated.
    return () => <Missing name={name} />;
  }
  const RemoteScreen = React.lazy(load);

  return function MiniAppScreen() {
    return (
      <Suspense fallback={<Loading />}>
        <RemoteScreen />
      </Suspense>
    );
  };
}

function Loading() {
  return (
    <SafeAreaView style={styles.container} edges={SCREEN_EDGES}>
      <ActivityIndicator size="large" />
    </SafeAreaView>
  );
}

function Missing({ name }: { name: string }) {
  return (
    <SafeAreaView style={styles.container} edges={SCREEN_EDGES}>
      <Text style={styles.message}>
        No loader for "{name}". Add mini-apps with `npx create-dda-stack add-miniapp` so src/miniapps/loaders.ts
        stays in sync with miniapps.json.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    padding: 24,
  },
  message: { textAlign: 'center' },
});
