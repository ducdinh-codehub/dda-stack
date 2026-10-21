import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import type { StateManagement } from './prompts.js';
import { approvePnpmBuilds, type PackageManager } from './packageManager.js';
import { overlayTemplate, TEMPLATES_ROOT, type TemplateVars } from './scaffold.js';
import { initExpo } from './nativeInit.js';
import { alignWithExpoSdk } from './expoDeps.js';

/**
 * Oldest Expo SDK the Expo superapp supports: @callstack/repack-expo (Re.Pack's
 * Expo integration, which swaps Metro for Rspack) needs SDK 56+.
 */
export const MIN_EXPO_SUPERAPP_SDK = 56;

/** The Re.Pack and @callstack/repack-expo versions the templates pin. */
export function expoSuperappRepackVersions(): { repack: string; repackExpo: string } {
  const additions = JSON.parse(
    fs.readFileSync(path.join(TEMPLATES_ROOT, 'superapp-expo', 'common', 'package.additions.json'), 'utf8'),
  );
  return {
    repack: additions.dependencies['@callstack/repack'],
    repackExpo: additions.dependencies['@callstack/repack-expo'],
  };
}

/** A reverse-DNS segment from a slug — Android's package rules: a letter first, then letters/digits/_. */
function idSegment(slug: string): string {
  const segment = slug.replace(/[^a-z0-9]/g, '');
  return /^[a-z]/.test(segment) ? segment : `app${segment}`;
}

/**
 * Registers Re.Pack's config plugin, which rewires the native projects
 * `expo prebuild` generates to load the bundle from Re.Pack instead of Metro,
 * and turns off what that integration doesn't support.
 */
function configureAppJson(destDir: string, opts: { projectSlug: string; appSlug: string }) {
  const appJsonPath = path.join(destDir, 'app.json');
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  const expo = appJson.expo;

  const plugins: unknown[] = expo.plugins ?? [];
  if (!plugins.includes('@callstack/repack-expo')) plugins.push('@callstack/repack-expo');
  expo.plugins = plugins;
  // Expo Updates (OTA) isn't supported with Re.Pack — sub-apps already update
  // over the network through Module Federation.
  expo.updates = { ...expo.updates, enabled: false };
  // Already the default from SDK 56 — repack-expo's doctor flags it as redundant.
  if (expo.newArchEnabled === true) delete expo.newArchEnabled;
  // Re.Pack builds iOS and Android only.
  delete expo.web;

  // Set up front so `expo prebuild` doesn't stop to ask — and so the host and
  // each sub-app install side by side on one device.
  const id = `com.${idSegment(opts.projectSlug)}.${idSegment(opts.appSlug)}`;
  expo.ios = { ...expo.ios, bundleIdentifier: expo.ios?.bundleIdentifier ?? id };
  expo.android = { ...expo.android, package: expo.android?.package ?? id };

  fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');

  const pkgPath = path.join(destDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  delete pkg.scripts?.web;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

/** Scaffolds an Expo superapp host or sub-app: an Expo project bundled by Re.Pack with Module Federation. */
export async function buildExpoSuperappApp(opts: {
  role: 'host' | 'remote';
  /** Display name, written to app.json. */
  appName: string;
  /** Used for the iOS bundle id / Android package, e.g. "host" -> com.myapp.host. */
  appSlug: string;
  destDir: string;
  expoSdk: number;
  vars: TemplateVars;
  label: string;
  useReactotron: boolean;
  stateManagement: StateManagement;
  pm: PackageManager;
}) {
  // No spinner: create-expo-app may show its own prompt — see initExpo().
  p.log.step(`Generating Expo SDK ${opts.expoSdk} project for ${opts.label}`);
  await initExpo(opts.appName, opts.destDir, opts.expoSdk);
  p.log.success(`Expo project generated for ${opts.label}`);

  const vars = { ...opts.vars, expoSdk: String(opts.expoSdk) };
  const overlays = [
    path.join(TEMPLATES_ROOT, 'common'),
    path.join(TEMPLATES_ROOT, 'lint', 'expo-overlay'),
    path.join(TEMPLATES_ROOT, 'superapp', `${opts.role}-common`),
    path.join(TEMPLATES_ROOT, 'superapp-expo', 'common'),
    path.join(TEMPLATES_ROOT, 'superapp-expo', `${opts.role}-overlay`),
    ...(opts.useReactotron ? [path.join(TEMPLATES_ROOT, 'reactotron', 'overlay')] : []),
    ...(opts.stateManagement !== 'none' ? [path.join(TEMPLATES_ROOT, 'state', opts.stateManagement)] : []),
  ];
  for (const overlay of overlays) overlayTemplate(overlay, opts.destDir, vars);

  configureAppJson(opts.destDir, { projectSlug: opts.vars.projectSlug, appSlug: opts.appSlug });

  if (opts.pm === 'pnpm') {
    // eslint-config-expo -> eslint-import-resolver-typescript -> unrs-resolver,
    // whose postinstall only checks its prebuilt native binding is present.
    approvePnpmBuilds(opts.destDir, ['unrs-resolver']);
  }

  // Pins expo-* and React Navigation's native deps to what this SDK was tested with.
  const result = await alignWithExpoSdk(opts.destDir, opts.expoSdk);
  if (!result) {
    p.log.warn(
      `Couldn't fetch Expo SDK ${opts.expoSdk}'s native module versions for ${opts.label}. ` +
        `Run \`npx expo install --fix\` after installing, or pod install may fail.`,
    );
  }
}
