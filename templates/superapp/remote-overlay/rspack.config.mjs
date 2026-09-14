import path from 'node:path';
import * as Repack from '@callstack/repack';
import getSharedDependencies from './sharedDeps.js';

/**
 * Remote sub-app: exposes screens/components the host loads at runtime.
 * Run this with its own dev server (see package.json's "start" script) —
 * the host's `remotes` entry points at whatever port this serves on.
 */
export default env => {
  const { mode = 'development', context = Repack.getDirname(import.meta.url), entry = './index.js', platform = process.env.PLATFORM } = env;
  const dirname = Repack.getDirname(import.meta.url);

  if (!platform) {
    throw new Error('Missing platform');
  }

  return {
    mode,
    context,
    entry,
    resolve: {
      ...Repack.getResolveOptions(),
      alias: {
        '@src': path.resolve(dirname, 'src'),
      },
    },
    output: {
      path: path.resolve(dirname, 'build/generated', platform),
      uniqueName: '{{remoteName}}',
    },
    module: {
      rules: [...Repack.getAssetTransformRules({ svg: 'xml' }), ...Repack.getJsTransformRules()],
    },
    devServer: {
      port: {{remotePort}},
    },
    plugins: [
      new Repack.RepackPlugin(),
      new Repack.plugins.ModuleFederationPluginV2({
        name: '{{remoteName}}',
        dts: false,
        exposes: {
          './HomeScreen': './src/screens/Home/HomeScreen',
        },
        shared: getSharedDependencies({ eager: false }),
      }),
    ],
  };
};
