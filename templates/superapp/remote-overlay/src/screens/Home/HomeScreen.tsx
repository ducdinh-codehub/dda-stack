import React from 'react';
import { Image, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// The header and tab bar already pad the top and bottom — this library's
// SafeAreaView uses the window's insets, so padding those edges again would
// double the gap.
const SCREEN_EDGES = ['left', 'right'] as const;

export function HomeScreen() {
  return (
    <SafeAreaView style={styles.container} edges={SCREEN_EDGES}>
      <Image
        source={require('../../assets/react-logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.title}>Welcome to DDA mini app</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    gap: 16,
    padding: 24,
  },
  logo: { width: 96, height: 96 },
  title: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
});
