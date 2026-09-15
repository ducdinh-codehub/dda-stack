import React, { Suspense } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet } from 'react-native';

// Loads the sub-app's exposed screen over the network via Module Federation —
// see the host's `remotes` and the sub-app's `exposes` in rspack.config.mjs.
// The sub-app must be running (its dev server, or a deployed bundle) for this
// to resolve.
const RemoteHomeScreen = React.lazy(() =>
  import('{{remoteName}}/HomeScreen').then(remoteModule => ({ default: remoteModule.HomeScreen })),
);

export function MiniAppScreen() {
  return (
    <Suspense fallback={<Loading />}>
      <RemoteHomeScreen />
    </Suspense>
  );
}

function Loading() {
  return (
    <SafeAreaView style={styles.container}>
      <ActivityIndicator size="large" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
});
