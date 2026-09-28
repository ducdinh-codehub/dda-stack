#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { runPrompts, toIdentifier, type Framework, type StateManagement } from './prompts.js';
import {
  installDependencies,
  ensurePackageManagerAvailable,
  formatRunCommand,
  formatCommandError,
  type PackageManager,
} from './packageManager.js';
import { overlayTemplate, TEMPLATES_ROOT, type TemplateVars } from './scaffold.js';
import { initReactNativeCli, initExpo } from './nativeInit.js';
import { question } from './theme.js';
import { addReanimatedForReactNative } from './reanimated.js';
import { alignWithExpoSdk } from './expoDeps.js';
import { getXcodeToolchain, isXcodeTooOldForExpoSdk } from './xcode.js';

const REMOTE_DEV_PORT = 9003;

/**
 * NativeWind needs reanimated + worklets, whose versions depend on the
 * generated project's react-native version — see reanimated.ts.
 */
function addReanimatedFor(destDir: string) {
  const added = addReanimatedForReactNative(destDir);
  if (added.fellBack) {
    p.log.warn(
      `No known react-native-reanimated release for react-native ${added.reactNative || '(unknown)'} — ` +
        `using the newest (${added.reanimated}). If pod install fails, check reanimated's compatibility table.`,
    );
  }
}

/**
 * Expo SDK 56+ doesn't compile for iOS with Xcode 26.0.x (Swift 6.2) — see
 * xcode.ts. Warn now rather than letting the first `expo run:ios` fail.
 */
async function warnIfXcodeTooOldForExpo(expoSdk: number) {
  const toolchain = await getXcodeToolchain();
  if (!toolchain || !isXcodeTooOldForExpoSdk(expoSdk, toolchain)) return;
  p.log.warn(
    `Xcode ${toolchain.xcodeVersion} (Swift ${toolchain.swiftMajor}.${toolchain.swiftMinor}) can't build Expo SDK ${expoSdk} for iOS. ` +
      `Update Xcode before running on iOS — Android is unaffected.`,
  );
}

function assertEmptyDir(dir: string) {
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
    p.cancel(`Directory "${path.basename(dir)}" already exists and is not empty.`);
    process.exit(1);
  }
}

async function buildRnCliApp(opts: {
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
  const s = p.spinner();
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

async function buildExpoApp(opts: {
  appName: string;
  destDir: string;
  expoSdk: number;
  vars: TemplateVars;
  label: string;
  useReactotron: boolean;
  useNativewind: boolean;
  stateManagement: StateManagement;
}) {
  // No spinner here specifically: this step inherits stdio on purpose (Expo's
  // generator can show its own interactive prompt), and an animated spinner
  // would fight it for the terminal — see initExpo().
  p.log.step(`Generating Expo SDK ${opts.expoSdk} project for ${opts.label}`);
  await initExpo(opts.appName, opts.destDir, opts.expoSdk);
  p.log.success(`Expo project generated for ${opts.label}`);

  overlayTemplate(path.join(TEMPLATES_ROOT, 'common'), opts.destDir, opts.vars);
  overlayTemplate(path.join(TEMPLATES_ROOT, 'expo', 'overlay'), opts.destDir, opts.vars);
  if (opts.useReactotron) {
    overlayTemplate(path.join(TEMPLATES_ROOT, 'reactotron', 'overlay'), opts.destDir, opts.vars);
  }
  if (opts.useNativewind) {
    overlayTemplate(path.join(TEMPLATES_ROOT, 'nativewind', 'expo-overlay'), opts.destDir, opts.vars);
    addReanimatedFor(opts.destDir);
  }
  if (opts.stateManagement !== 'none') {
    overlayTemplate(path.join(TEMPLATES_ROOT, 'state', opts.stateManagement), opts.destDir, opts.vars);
  }

  // Last, so it also corrects the reanimated pair picked by addReanimatedFor —
  // Expo's tested versions win over our RN-version table.
  const result = await alignWithExpoSdk(opts.destDir, opts.expoSdk);
  if (!result) {
    p.log.warn(
      `Couldn't fetch Expo SDK ${opts.expoSdk}'s native module versions. ` +
        `Run \`npx expo install --fix\` after installing, or pod install may fail.`,
    );
  }
}

async function main() {
  const cliArg = process.argv[2];
  const answers = await runPrompts(cliArg);
  const { framework, packageManager: pm } = answers;

  if (!(await ensurePackageManagerAvailable(pm))) {
    p.cancel(
      `${pm} is required but not available. Re-run and choose a different package manager, or install ${pm} manually first.`,
    );
    process.exit(1);
  }

  if (framework === 'expo') {
    const destDir = path.resolve(process.cwd(), answers.projectSlug);
    assertEmptyDir(destDir);

    // runPrompts always sets it for expo.
    const expoSdk = answers.expoSdk!;
    await buildExpoApp({
      appName: answers.projectName,
      destDir,
      expoSdk,
      vars: { projectName: answers.projectName, projectSlug: answers.projectSlug, expoSdk: String(expoSdk) },
      label: answers.projectName,
      useReactotron: answers.useReactotron,
      useNativewind: answers.useNativewind,
      stateManagement: answers.stateManagement,
    });

    await warnIfXcodeTooOldForExpo(expoSdk);

    await maybeInstallAndFinish([{ dir: destDir, label: answers.projectSlug }], pm, framework);
    return;
  }

  if (framework === 'rn-cli') {
    const destDir = path.resolve(process.cwd(), answers.projectSlug);
    assertEmptyDir(destDir);

    await buildRnCliApp({
      appName: toIdentifier(answers.projectSlug),
      destDir,
      pm,
      vars: { projectName: answers.projectName, projectSlug: answers.projectSlug },
      overlayDir: path.join(TEMPLATES_ROOT, 'rn-cli', 'overlay'),
      reactNativeVersion: answers.reactNativeVersion,
      label: answers.projectName,
      useReactotron: answers.useReactotron,
      useNativewind: answers.useNativewind,
      stateManagement: answers.stateManagement,
    });

    await maybeInstallAndFinish([{ dir: destDir, label: answers.projectSlug }], pm, framework);
    return;
  }

  // framework === 'superapp': always creates two sibling folders — host + sub-app.
  const hostSlug = `${answers.projectSlug}-host`;
  const remoteSlug = `${answers.projectSlug}-remote`;
  const remoteName = toIdentifier(answers.projectSlug);
  const hostDir = path.resolve(process.cwd(), hostSlug);
  const remoteDir = path.resolve(process.cwd(), remoteSlug);
  assertEmptyDir(hostDir);
  assertEmptyDir(remoteDir);

  // runPrompts always sets both for superapp.
  const repackVersion = answers.repackVersion!;
  const reactNativeVersion = answers.reactNativeVersion!;

  const sharedVars: TemplateVars = {
    projectName: answers.projectName,
    projectSlug: answers.projectSlug,
    remoteName,
    remotePort: String(REMOTE_DEV_PORT),
    repackVersion,
  };

  await buildRnCliApp({
    appName: `${remoteName}_host`,
    destDir: hostDir,
    pm,
    vars: sharedVars,
    overlayDir: path.join(TEMPLATES_ROOT, 'superapp', 'host-overlay'),
    label: `${hostSlug} (host)`,
    useReactotron: answers.useReactotron,
    // NativeWind isn't supported for superapp yet (Re.Pack/Rspack, not Metro) —
    // prompts.ts never asks in this case, so this is always false here.
    useNativewind: false,
    stateManagement: answers.stateManagement,
    reactNativeVersion,
  });

  await buildRnCliApp({
    appName: `${remoteName}_remote`,
    destDir: remoteDir,
    pm,
    vars: sharedVars,
    overlayDir: path.join(TEMPLATES_ROOT, 'superapp', 'remote-overlay'),
    label: `${remoteSlug} (sub-app)`,
    useReactotron: answers.useReactotron,
    useNativewind: false,
    stateManagement: answers.stateManagement,
    reactNativeVersion,
  });

  await maybeInstallAndFinish(
    [
      { dir: hostDir, label: hostSlug },
      { dir: remoteDir, label: remoteSlug },
    ],
    pm,
    framework,
  );
}

async function maybeInstallAndFinish(
  projects: Array<{ dir: string; label: string }>,
  pm: PackageManager,
  framework: Framework,
) {
  const shouldInstall = await p.confirm({
    message: question(
      `Install dependencies with ${pm} now? (${projects.length} project${projects.length > 1 ? 's' : ''})`,
    ),
    initialValue: true,
  });

  if (!p.isCancel(shouldInstall) && shouldInstall) {
    for (const project of projects) {
      // Spinner is safe here too — see the comment in buildRnCliApp above.
      const s = p.spinner();
      s.start(`Running ${pm} install in ${project.label}`);
      try {
        await installDependencies(project.dir, pm);
        s.stop(`Dependencies installed in ${project.label}`);
      } catch (err) {
        s.stop(`Install failed in ${project.label}`);
        p.log.error(formatCommandError(err));
      }
    }
  }

  const installed = !p.isCancel(shouldInstall) && shouldInstall;
  const lines = [`${pc.green('Done!')} Created:`, ''];
  for (const project of projects) {
    lines.push(`  ${project.dir}`);
  }
  lines.push('');
  for (const project of projects) {
    lines.push(`cd ${path.basename(project.dir)}`);
    if (!installed) lines.push(`  ${formatRunCommand(pm, 'install')}`);
    if (framework === 'expo') {
      lines.push('  npx expo prebuild  # generates native ios/ and android/ — run once before building natively');
    } else {
      lines.push(
        '  cd ios && bundle install && bundle exec pod install && cd ..  # run once, and again after adding native deps',
      );
    }
    lines.push(`  ${formatRunCommand(pm, 'ios')}`);
    lines.push(`  ${formatRunCommand(pm, 'android')}`);
  }
  if (projects.length > 1) {
    lines.push('', 'Start the sub-app first, then the host — the host loads it over the network.');
  }

  p.outro(lines.join('\n'));
}

main().catch(err => {
  p.cancel('Something went wrong.');
  console.error(formatCommandError(err));
  process.exit(1);
});
