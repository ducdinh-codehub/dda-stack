import React from 'react';
import { Image, SafeAreaView, StyleSheet, Text } from 'react-native';

export function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Image
        source={require('../../assets/react-logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.title}>Hello and welcome to DDA playground</Text>
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
