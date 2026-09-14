import path from 'node:path';
import * as Repack from '@callstack/repack';
import getSharedDependencies from './sharedDeps.js';

/**
 * Host app: loads remote sub-apps over the network at runtime via Module
 * Federation. Add each sub-app you scaffold with `create-dda-stack` to
 * `remotes` below (dev URL shown; point at your CDN/manifest host in prod).
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
      uniqueName: '{{projectSlug}}-host',
    },
    module: {
      rules: [...Repack.getAssetTransformRules({ svg: 'xml' }), ...Repack.getJsTransformRules()],
    },
    plugins: [
      new Repack.RepackPlugin(),
      new Repack.plugins.ModuleFederationPluginV2({
        name: 'host',
        dts: false,
        remotes:
          mode === 'development'
            ? {
                '{{remoteName}}': `{{remoteName}}@http://localhost:{{remotePort}}/${platform}/mf-manifest.json`,
              }
            : {},
        shared: getSharedDependencies({ eager: true }),
      }),
    ],
  };
};
