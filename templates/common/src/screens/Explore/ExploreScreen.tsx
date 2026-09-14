import React from 'react';
import { SafeAreaView, StyleSheet, Text } from 'react-native';

export function ExploreScreen() {
  return (
    <SafeAreaView style={styles.container}>
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
