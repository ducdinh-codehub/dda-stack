/**
 * @format
 */
import { AppRegistry } from 'react-native';
import { name as appName } from './app.json';
import App from './App';

// Runs standalone for local dev (yarn ios/android against this app directly).
// When loaded by the host, only the modules under `exposes` in
// rspack.config.mjs are actually pulled in — this entry point never runs.
AppRegistry.registerComponent(appName, () => App);
