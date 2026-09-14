/**
 * @format
 */
import { AppRegistry } from 'react-native';
import { ScriptManager } from '@callstack/repack/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { name as appName } from './app.json';
import App from './App';

// Lets Re.Pack cache downloaded remote (sub-app) bundles between launches.
ScriptManager.shared.setStorage(AsyncStorage);

AppRegistry.registerComponent(appName, () => App);
