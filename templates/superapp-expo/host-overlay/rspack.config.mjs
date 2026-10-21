import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Repack from '@callstack/repack';
import { ExpoPlugin } from '@callstack/repack-expo/rspack';
import getSharedDependencies from './sharedDeps.js';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * Expo host app, bundled by Re.Pack (Rspack) instead of Metro: ExpoPlugin
 * (@callstack/repack-expo) handles Expo's entry, Babel preset, assets and
 * EXPO_PUBLIC_* variables. Don't add a separate RepackPlugin — ExpoPlugin
 * already includes it.
 *
 * It loads remote sub-apps over the network at runtime via Module Federation.
 * The sub-apps come from miniapps.json — add one with
 * `npx create-dda-stack add-miniapp <name>`. In development each loads from
 * its own dev server (`port`); in production from `prodUrl`, the base URL
 * that serves `<platform>/mf-manifest.json` (entries without one are skipped).
 *
 * Versions in package.json are the set Re.Pack tests its Expo integration
 * with — @rspack/core is pinned to 1.6.0 because 1.6.2+ breaks Module
 * Federation v2's polyfill ordering. Bump them together, not one at a time.
 */
export default env => {
  const { entry, mode = 'development', platform = process.env.PLATFORM, devServer } = env;

  if (platform !== 'ios' && platform !== 'android') {
    throw new Error('Set PLATFORM to ios or android');
  }

  // The Android emulator has its own virtual network namespace — 'localhost'
  // there means the emulator itself, not this dev machine. 10.0.2.2 is the
  // emulator's fixed alias for the host machine's localhost. This still won't
  // reach a physical Android device — for that, replace it with this
  // machine's LAN IP (or run `adb reverse tcp:<port> tcp:<port>` for each
  // mini-app's port and use localhost).
  const remoteDevHost = platform === 'android' ? '10.0.2.2' : 'localhost';

  const miniApps = JSON.parse(fs.readFileSync(path.join(projectRoot, 'miniapps.json'), 'utf8'));
  const remotes = Object.fromEntries(
    miniApps
      .map(app => [app.name, mode === 'development' ? `http://${remoteDevHost}:${app.port}` : app.prodUrl])
      .filter(([, baseUrl]) => baseUrl)
      .map(([name, baseUrl]) => [name, `${name}@${baseUrl.replace(/\/$/, '')}/${platform}/mf-manifest.json`]),
  );

  return {
    context: projectRoot,
    devServer,
    mode,
    name: platform,
    output: {
      clean: true,
      path: path.join(projectRoot, 'build', 'rspack', platform),
      uniqueName: '{{projectSlug}}-host',
    },
    // @react-navigation/elements requires @react-native-masked-view/masked-view
    // inside a try/catch — it's optional, and the header works without it.
    // Rspack still warns that it can't be resolved on every build.
    ignoreWarnings: [/Can't resolve '@react-native-masked-view\/masked-view'/],
    plugins: [
      new ExpoPlugin({ entry, platform }),
      new Repack.plugins.ModuleFederationPluginV2({
        name: 'host',
        dts: false,
        remotes,
        shared: getSharedDependencies(),
      }),
    ],
  };
};
