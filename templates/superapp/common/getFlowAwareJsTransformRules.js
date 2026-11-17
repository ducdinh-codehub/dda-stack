/**
 * Repack's default `Repack.getJsTransformRules()` strips Flow types via
 * `flow-remove-types`, which only erases type *annotations* — it doesn't
 * transform Flow's `component Foo(...) {}` / `enum X {}` declaration syntax,
 * which react-native's own core library files use throughout. Left as-is,
 * swc's parser chokes on that syntax as soon as anything imports from
 * `react-native` (see https://github.com/callstack/repack/issues, still open
 * as of repack 5.3.0 / react-native 0.86).
 *
 * This routes react-native (and @react-native/*) source through a real Babel
 * Flow transform instead — the same one Metro itself uses — as an exclusive
 * branch ahead of the swc branches in the same `oneOf`, so each file is only
 * processed once.
 */
function getFlowAwareJsTransformRules(Repack) {
  const jsRules = Repack.getJsTransformRules({ flow: { enabled: false } });

  jsRules[0].oneOf.unshift({
    test: /jsx?$/,
    include: Repack.getModulePaths(['react-native', '@react-native']),
    use: {
      loader: 'babel-loader',
      options: {
        presets: [['module:@react-native/babel-preset', { disableStaticViewConfigsCodegen: true }]],
        // @babel/parser's flow plugin defaults to a stricter/ambiguous mode that
        // can't parse generic type args on `new`/call expressions (e.g.
        // `new Set<string>()`, used in react-native's own NativeAnimatedHelper.js).
        // `all: true` parses the file as fully Flow-typed and covers it.
        plugins: [['@babel/plugin-syntax-flow', { all: true }]],
        babelrc: false,
        configFile: false,
      },
    },
  });

  return jsRules;
}

module.exports = getFlowAwareJsTransformRules;
