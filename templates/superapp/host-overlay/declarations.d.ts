declare module '@env' {
  export const API_BASE_URL: string;
}

declare module '*.png' {
  const value: number;
  export default value;
}

// The sub-app's exposed module, loaded at runtime via Module Federation (see
// `remotes`/`exposes` in each side's rspack.config.mjs) — TS has no way to
// see across that boundary, so this just shapes what MiniAppScreen expects.
declare module '{{remoteName}}/HomeScreen' {
  import type { ComponentType } from 'react';
  export const HomeScreen: ComponentType;
}
