import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// The header and tab bar already pad the top and bottom — this library's
// SafeAreaView uses the window's insets, so padding those edges again would
// double the gap. Expo Router's header-less tabs add the top edge in app/(tabs)/.
const SCREEN_EDGES = ['left', 'right'] as const;

export function ExploreScreen() {
  return (
    <SafeAreaView style={styles.container} edges={SCREEN_EDGES}>
      <Text style={styles.title}>Explore</Text>
      <Text style={styles.subtitle}>
        A second tab — add more in src/navigation/RootNavigator.tsx.
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
    gap: 8,
    padding: 24,
  },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 14, color: '#555555', textAlign: 'center' },
});
