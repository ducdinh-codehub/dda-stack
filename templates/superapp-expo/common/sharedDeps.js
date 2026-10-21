/**
 * Dependencies shared as Module Federation singletons between the host and
 * every remote (sub-app). Both sides must list the same libs here so React,
 * React Native, Expo's modules and React Navigation aren't loaded twice at
 * runtime.
 *
 * Eager on both sides, as in Re.Pack's Expo host + widget setup: the sub-app
 * keeps a plain synchronous entry (index.ts) so it still runs standalone.
 */
function getSharedDependencies() {
  const pkg = require('./package.json');
  // Module Federation's `requiredVersion` must be the version actually being
  // provided, not the semver range from package.json (stripping the `^`/`~`
  // off "^7.0.0" gives the literal "7.0.0", which almost never matches what
  // npm actually resolved, e.g. 7.3.18).
  const installedVersion = dep => require(`${dep}/package.json`).version;

  const shared = [
    'react',
    'react-native',
    // Expo's native module wrappers keep state (loaded fonts, asset registry,
    // app config) that only works as one copy.
    'expo-asset',
    'expo-constants',
    'expo-font',
    '@react-navigation/native',
    '@react-navigation/native-stack',
    '@react-navigation/bottom-tabs',
    '@tanstack/react-query',
    // Native view components register by name — a second copy of this lib
    // loaded with a sub-app would throw "Tried to register two views with
    // the same name RNCSafeAreaView".
    'react-native-safe-area-context',
    // Optional state management — only shared if chosen at scaffold time.
    'zustand',
    '@reduxjs/toolkit',
    'react-redux',
  ];

  return Object.fromEntries(
    shared
      .filter(dep => pkg.dependencies?.[dep])
      .map(dep => [
        dep,
        {
          singleton: true,
          eager: true,
          // Set explicitly rather than auto-detected — rspack's SharePlugin
          // silently drops the "provide" side for packages whose entry point
          // isn't at the package root, which fails at runtime with RUNTIME-006.
          version: installedVersion(dep),
          requiredVersion: installedVersion(dep),
        },
      ]),
  );
}

module.exports = getSharedDependencies;
