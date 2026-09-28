import React from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useCounterStore } from '../../store/useCounterStore';

export function ExploreScreen() {
  // Zustand example — see src/store/useCounterStore.ts.
  const count = useCounterStore(state => state.count);
  const onIncrement = useCounterStore(state => state.increment);
  const onDecrement = useCounterStore(state => state.decrement);
  const onReset = useCounterStore(state => state.reset);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Explore</Text>
      <Text style={styles.subtitle}>
        A second tab — add more in src/navigation/RootNavigator.tsx.
      </Text>
      <Text style={styles.count}>{count}</Text>
      <View style={styles.row}>
        <Pressable style={styles.button} onPress={onDecrement}>
          <Text style={styles.buttonText}>−</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={onReset}>
          <Text style={styles.buttonText}>Reset</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={onIncrement}>
          <Text style={styles.buttonText}>+</Text>
        </Pressable>
      </View>
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
  count: { fontSize: 48, fontWeight: '700', marginTop: 16 },
  row: { flexDirection: 'row', gap: 12 },
  button: {
    minWidth: 56,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#222222',
    alignItems: 'center',
  },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});
