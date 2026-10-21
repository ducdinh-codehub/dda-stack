import type { ComponentType } from 'react';
import { miniAppLoaders } from './loaders';

/**
 * The loader for one mini-app's exposed HomeScreen, or undefined if loaders.ts
 * doesn't know it. Module Federation only resolves static
 * `import('name/Module')` calls, so each one lives in the generated loaders.ts.
 */
export function getMiniAppLoader(name: string): (() => Promise<{ default: ComponentType }>) | undefined {
  return miniAppLoaders[name];
}
