import fs from 'node:fs';
import path from 'node:path';
import * as Repack from '@callstack/repack';
import getSharedDependencies from './sharedDeps.js';
import getFlowAwareJsTransformRules from './getFlowAwareJsTransformRules.js';

/**
 * Host app: loads remote sub-apps over the network at runtime via Module
 * Federation. The sub-apps come from miniapps.json — add one with
 * `npx create-dda-stack add-miniapp <name>`. In development each loads from
 * its own dev server (`port`); in production from `prodUrl`, the base URL
 * that serves `<platform>/mf-manifest.json` (entries without one are skipped).
 *
 * package.additions.json pins @module-federation/enhanced and
 * @module-federation/runtime to an exact 2.9.0 — don't bump this casually.
 * @callstack/repack@5.3.0 is built against the older 0.8.x line, but rspack's
 * own built-in Module Federation runtime template (baked into @rspack/core,
 * not @module-federation/*) calls `federation.bundlerRuntime.init(...)`,
 * a method 0.8.x's `webpack-bundler-runtime` doesn't have (only `I`,
 * `installInitialConsumes`, `initContainerEntry` — no `init`). That mismatch
 * crashes every app at startup with "[runtime not ready] TypeError: undefined
 * is not a function" inside a virtual `@module-federation/runtime/rspack.js`
 * module. 2.9.0's `webpack-bundler-runtime` does have `.init`, and is fully
 * lockstep-versioned across the whole @module-federation/* family, so use it
 * instead — despite that not being what repack's own devDependencies test.
 */
export default env => {
  const { mode = 'development', context = Repack.getDirname(import.meta.url), entry = './index.js', platform = process.env.PLATFORM } = env;
  const dirname = Repack.getDirname(import.meta.url);

  if (!platform) {
    throw new Error('Missing platform');
  }

  // The Android emulator has its own virtual network namespace — 'localhost'
  // there means the emulator itself, not this dev machine, so a request to
  // the sub-app's dev server fails with "[ Federation Runtime ]: Failed to
  // get manifest. #RUNTIME-003". 10.0.2.2 is the emulator's fixed alias for
  // the host machine's localhost. This still won't reach a physical Android
  // device — for that, replace it with this machine's LAN IP (and run
  // `adb reverse tcp:<port> tcp:<port>` for each mini-app's port as an
  // alternative to opening those ports on the LAN).
  const remoteDevHost = platform === 'android' ? '10.0.2.2' : 'localhost';

  const miniApps = JSON.parse(fs.readFileSync(path.resolve(dirname, 'miniapps.json'), 'utf8'));
  const remotes = Object.fromEntries(
    miniApps
      .map(app => [app.name, mode === 'development' ? `http://${remoteDevHost}:${app.port}` : app.prodUrl])
      .filter(([, baseUrl]) => baseUrl)
      .map(([name, baseUrl]) => [name, `${name}@${baseUrl.replace(/\/$/, '')}/${platform}/mf-manifest.json`]),
  );

  return {
    mode,
    context,
    entry,
    resolve: {
      // enablePackageExports: swc's compiled output requires helpers via
      // subpaths like '@swc/helpers/_/_interop_require_default', which only
      // exist through that package's `exports` map — repack's default
      // resolver config ignores `exports` maps entirely, so every one of
      // those requires would otherwise resolve to a throwing stub at runtime.
      ...Repack.getResolveOptions(platform, { enablePackageExports: true }),
      alias: {
        '@src': path.resolve(dirname, 'src'),
      },
    },
    output: {
      path: path.resolve(dirname, 'build/generated', platform),
      uniqueName: '{{projectSlug}}-host',
    },
    // @react-navigation/elements requires @react-native-masked-view/masked-view
    // inside a try/catch — it's optional, and the header works without it.
    // Rspack still warns that it can't be resolved on every build.
    ignoreWarnings: [/Can't resolve '@react-native-masked-view\/masked-view'/],
    module: {
      rules: [...Repack.getAssetTransformRules({ svg: 'xml' }), ...getFlowAwareJsTransformRules(Repack)],
    },
    plugins: [
      new Repack.RepackPlugin(),
      new Repack.plugins.ModuleFederationPluginV2({
        name: 'host',
        dts: false,
        remotes,
        shared: getSharedDependencies({ eager: true }),
      }),
    ],
  };
};
