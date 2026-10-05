import React, { Suspense, type ComponentType, type PropsWithChildren, type ReactNode } from 'react';
import { ActivityIndicator, DevSettings, Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { miniAppLoaders } from './loaders';

// The header and tab bar already pad the top and bottom — this library's
// SafeAreaView uses the window's insets, so padding those edges again would
// double the gap.
const SCREEN_EDGES = ['left', 'right'] as const;

interface MiniAppInfo {
  name: string;
  title: string;
  port: number;
}

/**
 * Builds the tab screen for one mini-app. Its exposed screen is loaded over
 * the network via Module Federation — see `remotes` in rspack.config.mjs and
 * each sub-app's `exposes`. The sub-app must be running (its dev server, or a
 * deployed bundle) for this to resolve; if it can't load, the tab says why
 * instead of crashing the app.
 *
 * Call this once per mini-app at module level, never during render — each
 * call creates a new React.lazy component.
 */
export function createMiniAppScreen(app: MiniAppInfo): ComponentType {
  const load = miniAppLoaders[app.name];
  if (!load) {
    // miniapps.json lists it, but loaders.ts wasn't regenerated.
    return () => (
      <Message title={`No loader for "${app.title}"`}>
        Add mini-apps with `npx create-dda-stack add-miniapp` so src/miniapps/loaders.ts stays in sync with
        miniapps.json.
      </Message>
    );
  }
  const RemoteScreen = React.lazy(load);

  return function MiniAppScreen() {
    return (
      <MiniAppErrorBoundary app={app}>
        <Suspense fallback={<Loading />}>
          <RemoteScreen />
        </Suspense>
      </MiniAppErrorBoundary>
    );
  };
}

class MiniAppErrorBoundary extends React.Component<PropsWithChildren<{ app: MiniAppInfo }>, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    return error ? <LoadFailed app={this.props.app} error={error} /> : this.props.children;
  }
}

function LoadFailed({ app, error }: { app: MiniAppInfo; error: Error }) {
  if (!__DEV__) {
    return <Message title={`${app.title} isn't available right now`}>Please try again later.</Message>;
  }

  // The host's build only knows the remotes that were in miniapps.json when
  // its dev server started, so a mini-app added since then can't resolve at all.
  const notInBuild = error.message.includes('Cannot find module');

  return (
    <Message
      title={`Couldn't load ${app.title}`}
      action={
        // Module Federation remembers a remote that failed to load, so only a
        // full reload tries it again.
        <Pressable style={styles.button} onPress={() => DevSettings.reload()} accessibilityRole="button">
          <Text style={styles.buttonText}>Reload app</Text>
        </Pressable>
      }
    >
      {notInBuild
        ? "The host's dev server was started before this mini-app was added. Restart it (Ctrl+C, then start it again with --reset-cache), then reload."
        : `Is its dev server running? Start it in the mini-app's folder — it serves on port ${app.port} — or run dev:all in the host to start everything.`}
      {'\n\n'}
      <Text style={styles.error}>{error.message}</Text>
    </Message>
  );
}

function Message({ title, action, children }: PropsWithChildren<{ title: string; action?: ReactNode }>) {
  return (
    <SafeAreaView style={styles.container} edges={SCREEN_EDGES}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{children}</Text>
      {action}
    </SafeAreaView>
  );
}

function Loading() {
  return (
    <SafeAreaView style={styles.container} edges={SCREEN_EDGES}>
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
    gap: 12,
    padding: 24,
  },
  title: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  message: { fontSize: 14, color: '#555555', textAlign: 'center' },
  error: { fontSize: 12, color: '#999999', fontFamily: 'Courier' },
  button: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#111111',
  },
  buttonText: { color: '#ffffff', fontWeight: '600' },
});
