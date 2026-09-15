/**
 * Dependencies shared as Module Federation singletons between the host and
 * every remote (sub-app). Both sides must list the same libs here so React,
 * React Native, and React Navigation aren't loaded twice at runtime.
 *
 * @param {{ eager: boolean }} options Use eager: true in the host, eager: false in remotes.
 */
function getSharedDependencies({ eager = true }) {
  const pkg = require('./package.json');
  // Module Federation's `requiredVersion` must be the version actually being
  // provided, not the semver range from package.json (stripping the `^`/`~`
  // off "^7.0.0" gives the literal "7.0.0", which almost never matches what
  // npm actually resolved, e.g. 7.3.18).
  const installedVersion = dep => require(`${dep}/package.json`).version;

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
          // `version` (what THIS build provides) must be set explicitly too —
          // rspack's SharePlugin tries to auto-detect it by walking up from
          // the resolved entry file (e.g. .../lib/module/index.js) looking
          // for a package.json with a "version" field, and gives up silently
          // for packages whose entry point isn't at the package root. When
          // that happens the package's "provide" registration is dropped
          // entirely — the consume side still looks configured correctly,
          // but at runtime `loadShareSync` finds nothing to return and
          // throws "[ Federation Runtime ]: Invalid loadShareSync function
          // call ... RUNTIME-006". Providing `version` ourselves skips that
          // fragile auto-detection.
          version: installedVersion(dep),
          requiredVersion: installedVersion(dep),
        },
      ]),
  );
}

module.exports = getSharedDependencies;
