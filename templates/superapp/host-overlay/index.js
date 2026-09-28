/**
 * @format
 */
import { AppRegistry } from 'react-native';
import { ScriptManager } from '@callstack/repack/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { name as appName } from './app.json';
import App from './App';

// Lets Re.Pack cache downloaded remote (sub-app) bundles between launches —
// release builds only. Re.Pack reuses a cached chunk until its URL, headers or
// body change, never its contents, and dev chunk URLs never change, so in dev
// the host would keep showing a stale sub-app after every edit.
if (!__DEV__) {
  ScriptManager.shared.setStorage(AsyncStorage);
}

AppRegistry.registerComponent(appName, () => App);
