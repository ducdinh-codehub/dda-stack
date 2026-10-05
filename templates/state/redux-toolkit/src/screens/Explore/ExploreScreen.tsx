import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { decrement, increment, reset } from '../../store/counterSlice';

// The header and tab bar already pad the top and bottom — this library's
// SafeAreaView uses the window's insets, so padding those edges again would
// double the gap. Expo Router's header-less tabs add the top edge in app/(tabs)/.
const SCREEN_EDGES = ['left', 'right'] as const;

export function ExploreScreen() {
  // Redux Toolkit example — see src/store/counterSlice.ts.
  const count = useAppSelector(state => state.counter.count);
  const dispatch = useAppDispatch();
  const onIncrement = () => dispatch(increment());
  const onDecrement = () => dispatch(decrement());
  const onReset = () => dispatch(reset());

  return (
    <SafeAreaView style={styles.container} edges={SCREEN_EDGES}>
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
