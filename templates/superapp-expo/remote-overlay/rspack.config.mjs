import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Repack from '@callstack/repack';
import { ExpoPlugin } from '@callstack/repack-expo/rspack';
import getSharedDependencies from './sharedDeps.js';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

// Where production builds are served from: the URL you deploy
// build/remote/<platform>/ to (each platform under its own folder), and the
// same URL as this mini-app's `prodUrl` in the host's miniapps.json.
// Production builds need it — chunks and assets are loaded from there.
const PROD_URL = '';

/**
 * Remote sub-app, bundled by Re.Pack (Rspack) with Expo support from
 * ExpoPlugin (@callstack/repack-expo). It exposes screens the host loads at
 * runtime. Run it with its own dev server (`npm start`) — the host's
 * `remotes` entry points at the port it serves on.
 *
 * Every chunk is published as a remote one (extraChunks), so nested lazy
 * imports load from this mini-app's server too, not from the host's app.
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

  // Must match the host's dev URL for this mini-app — see its rspack.config.mjs.
  const devHost = platform === 'android' ? '10.0.2.2' : 'localhost';
  const baseUrl = mode === 'development' ? `http://${devHost}:{{remotePort}}` : PROD_URL.replace(/\/$/, '');
  if (!baseUrl) {
    throw new Error('Set PROD_URL in rspack.config.mjs to where this mini-app is deployed before a production build.');
  }
  const remoteOutputPath = path.join(projectRoot, 'build', 'remote', platform);

  return {
    context: projectRoot,
    devServer: { ...devServer, port: {{remotePort}} },
    mode,
    name: platform,
    module: {
      rules:
        mode === 'production'
          ? Repack.getAssetTransformRules({ remote: { publicPath: `${baseUrl}/${platform}/remote-assets` } })
          : [],
    },
    output: {
      clean: true,
      path: path.join(projectRoot, 'build', 'rspack', platform),
      publicPath: `${baseUrl}/${platform}/`,
      uniqueName: '{{remoteName}}',
    },
    // @react-navigation/elements requires @react-native-masked-view/masked-view
    // inside a try/catch — it's optional, and the header works without it.
    // Rspack still warns that it can't be resolved on every build.
    ignoreWarnings: [/Can't resolve '@react-native-masked-view\/masked-view'/],
    plugins: [
      new ExpoPlugin({
        entry,
        platform,
        repack: {
          output: { auxiliaryAssetsPath: remoteOutputPath },
          extraChunks: [{ include: /.*/, type: 'remote', outputPath: remoteOutputPath }],
        },
      }),
      new Repack.plugins.ModuleFederationPluginV2({
        name: '{{remoteName}}',
        // Its own name, so it can't collide with the app's main bundle.
        filename: '{{remoteName}}.container.js.bundle',
        dts: false,
        exposes: {
          './HomeScreen': './src/screens/Home/HomeScreen',
        },
        shared: getSharedDependencies(),
      }),
    ],
  };
};
