import fs from 'node:fs';
import path from 'node:path';

/**
 * A superapp host lists its sub-apps in miniapps.json. rspack.config.mjs reads
 * it for `remotes` and RootNavigator reads it for the bottom tabs, so adding a
 * mini-app is one new entry there — plus regenerating the two files below,
 * which can't be derived at runtime: Module Federation only resolves static
 * `import('name/Module')` calls, and TypeScript needs a `declare module` per name.
 */
export interface MiniApp {
  /** MF container name — a JS identifier, also the tab's route name. */
  name: string;
  title: string;
  icon: string;
  /** Dev server port. */
  port: number;
  /** Base URL serving `<platform>/mf-manifest.json` in release builds; '' to skip. */
  prodUrl: string;
}

export const MINIAPPS_FILE = 'miniapps.json';
export const FIRST_REMOTE_PORT = 9003;

export function readMiniApps(hostDir: string): MiniApp[] {
  return JSON.parse(fs.readFileSync(path.join(hostDir, MINIAPPS_FILE), 'utf8'));
}

export function nextFreePort(apps: MiniApp[]): number {
  return Math.max(FIRST_REMOTE_PORT - 1, ...apps.map(app => app.port)) + 1;
}

/** Writes miniapps.json and regenerates the files derived from it. */
export function writeMiniApps(hostDir: string, apps: MiniApp[]) {
  fs.writeFileSync(path.join(hostDir, MINIAPPS_FILE), JSON.stringify(apps, null, 2) + '\n');
  syncMiniAppFiles(hostDir, apps);
}

export function syncMiniAppFiles(hostDir: string, apps: MiniApp[]) {
  const dir = path.join(hostDir, 'src', 'miniapps');
  fs.mkdirSync(dir, { recursive: true });

  const header = `// Generated from ${MINIAPPS_FILE} by create-dda-stack — don't edit by hand.\n// Add mini-apps with \`npx create-dda-stack add-miniapp <name>\`.\n`;

  const loaders = apps
    .map(
      app =>
        `  ${app.name}: () => import('${app.name}/HomeScreen').then(remoteModule => ({ default: remoteModule.HomeScreen })),`,
    )
    .join('\n');
  fs.writeFileSync(
    path.join(dir, 'loaders.ts'),
    `${header}import type { ComponentType } from 'react';

export const miniAppLoaders: Record<string, () => Promise<{ default: ComponentType }>> = {
${loaders}
};
`,
  );

  // Each sub-app's exposed module, loaded at runtime via Module Federation —
  // TS has no way to see across that boundary, so this just shapes what the
  // loaders expect.
  const declarations = apps
    .map(
      app => `declare module '${app.name}/HomeScreen' {
  import type { ComponentType } from 'react';
  export const HomeScreen: ComponentType;
}`,
    )
    .join('\n\n');
  fs.writeFileSync(path.join(dir, 'remotes.d.ts'), `${header}\n${declarations}\n`);
}
