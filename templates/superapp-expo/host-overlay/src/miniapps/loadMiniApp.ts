import type { ComponentType } from 'react';
import { loadRemote } from '@module-federation/enhanced/runtime';

/**
 * The loader for one mini-app's exposed HomeScreen. Re.Pack's Expo integration
 * loads remotes through the Module Federation runtime's loadRemote() rather
 * than a bundler `import('name/Module')`, so any name from miniapps.json works
 * here without generated code — as long as rspack.config.mjs registered it.
 */
export function getMiniAppLoader(name: string): () => Promise<{ default: ComponentType }> {
  return async () => {
    const remoteModule = await loadRemote<{ HomeScreen: ComponentType }>(`${name}/HomeScreen`);
    if (!remoteModule) throw new Error(`${name}/HomeScreen returned no module`);
    return { default: remoteModule.HomeScreen };
  };
}
