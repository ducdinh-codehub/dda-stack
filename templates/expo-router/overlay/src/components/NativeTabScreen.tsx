import React, { type PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Native tabs have no header, so each tab route pads the status bar itself.
 * The screens in src/screens only pad left/right — under React Navigation the
 * header covers the top.
 */
export function NativeTabScreen({ children }: PropsWithChildren) {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
});
