import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import type { PackageManager } from './packageManager.js';
import type { StateManagement } from './prompts.js';
import { overlayTemplate, TEMPLATES_ROOT, type TemplateVars } from './scaffold.js';
import { initReactNativeCli } from './nativeInit.js';
import { spinner } from './theme.js';
import { addReanimatedForReactNative } from './reanimated.js';

/**
 * NativeWind needs reanimated + worklets, whose versions depend on the
 * generated project's react-native version — see reanimated.ts.
 */
export function addReanimatedFor(destDir: string) {
  const added = addReanimatedForReactNative(destDir);
  if (added.fellBack) {
    p.log.warn(
      `No known react-native-reanimated release for react-native ${added.reactNative || '(unknown)'} — ` +
        `using the newest (${added.reanimated}). If pod install fails, check reanimated's compatibility table.`,
    );
  }
}

export function assertEmptyDir(dir: string) {
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
    p.cancel(`Directory "${path.basename(dir)}" already exists and is not empty.`);
    process.exit(1);
  }
}

export async function buildRnCliApp(opts: {
  appName: string;
  destDir: string;
  pm: PackageManager;
  vars: TemplateVars;
  overlayDir: string;
  label: string;
  useReactotron: boolean;
  useNativewind: boolean;
  stateManagement: StateManagement;
  reactNativeVersion?: string;
}) {
  // Spinner is safe here: the generator's own output is captured, not streamed,
  // so there's nothing else writing to the terminal for it to fight with.
  const s = spinner();
  s.start(`Generating native project for ${opts.label}`);
  await initReactNativeCli(opts.appName, opts.destDir, opts.pm, opts.reactNativeVersion);
  s.stop(`Native project generated for ${opts.label}`);

  overlayTemplate(path.join(TEMPLATES_ROOT, 'common'), opts.destDir, opts.vars);
  overlayTemplate(opts.overlayDir, opts.destDir, opts.vars);
  if (opts.useReactotron) {
    overlayTemplate(path.join(TEMPLATES_ROOT, 'reactotron', 'overlay'), opts.destDir, opts.vars);
  }
  if (opts.useNativewind) {
    overlayTemplate(path.join(TEMPLATES_ROOT, 'nativewind', 'rn-cli-overlay'), opts.destDir, opts.vars);
    addReanimatedFor(opts.destDir);
  }
  if (opts.stateManagement !== 'none') {
    overlayTemplate(path.join(TEMPLATES_ROOT, 'state', opts.stateManagement), opts.destDir, opts.vars);
  }
}
