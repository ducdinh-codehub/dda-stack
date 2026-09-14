/**
 * Dependencies shared as Module Federation singletons between the host and
 * every remote (sub-app). Both sides must list the same libs here so React,
 * React Native, and React Navigation aren't loaded twice at runtime.
 *
 * @param {{ eager: boolean }} options Use eager: true in the host, eager: false in remotes.
 */
function getSharedDependencies({ eager = true }) {
  const pkg = require('./package.json');
  const version = v => (v ?? '').replace(/^[\^~]/, '');

  const shared = [
    'react',
    'react-native',
    '@react-navigation/native',
    '@react-navigation/native-stack',
    '@react-navigation/bottom-tabs',
    '@tanstack/react-query',
  ];

  return Object.fromEntries(
    shared
      .filter(dep => pkg.dependencies?.[dep])
      .map(dep => [
        dep,
        {
          singleton: true,
          eager,
          requiredVersion: version(pkg.dependencies[dep]),
        },
      ]),
  );
}

module.exports = getSharedDependencies;
