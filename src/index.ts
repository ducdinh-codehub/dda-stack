#!/usr/bin/env node
import path from 'node:path';
import * as p from '@clack/prompts';
import { containerNameProblem, runPrompts, toIdentifier, type ExpoRouter, type StateManagement } from './prompts.js';
import { parseCliArgs, CliArgsError } from './args.js';
import { ensurePackageManagerAvailable, formatCommandError, approvePnpmBuilds, type PackageManager } from './packageManager.js';
import { overlayTemplate, TEMPLATES_ROOT, type TemplateVars } from './scaffold.js';
import { initExpo } from './nativeInit.js';
import { addReanimatedFor, assertEmptyDir, buildRnCliApp } from './rnCliApp.js';
import { FIRST_REMOTE_PORT, readMiniApps, syncMiniAppFiles } from './miniApps.js';
import { maybeInstallAndFinish } from './finish.js';
import { runAddMiniApp } from './addMiniApp.js';
import { alignWithExpoSdk } from './expoDeps.js';
import { finishExpoRouterSetup } from './expoRouter.js';
import { getXcodeToolchain, isXcodeTooOldForExpoSdk } from './xcode.js';
import { reportError, setReportAnswers, throwIfForcedError } from './errorReport.js';

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

async function buildExpoApp(opts: {
  appName: string;
  destDir: string;
  expoSdk: number;
  vars: TemplateVars;
  label: string;
  useReactotron: boolean;
  useNativewind: boolean;
  stateManagement: StateManagement;
  expoRouter: ExpoRouter;
  pm: PackageManager;
}) {
  // No spinner here specifically: this step inherits stdio on purpose (Expo's
  // generator can show its own interactive prompt), and an animated spinner
  // would fight it for the terminal — see initExpo().
  p.log.step(`Generating Expo SDK ${opts.expoSdk} project for ${opts.label}`);
  await initExpo(opts.appName, opts.destDir, opts.expoSdk);
  p.log.success(`Expo project generated for ${opts.label}`);

  overlayTemplate(path.join(TEMPLATES_ROOT, 'common'), opts.destDir, opts.vars);
  overlayTemplate(path.join(TEMPLATES_ROOT, 'expo', 'overlay'), opts.destDir, opts.vars);
  // The RN CLI template already ships ESLint + Prettier; Expo's blank one doesn't.
  overlayTemplate(path.join(TEMPLATES_ROOT, 'lint', 'expo-overlay'), opts.destDir, opts.vars);
  const useExpoRouter = opts.expoRouter === 'expo-router';
  if (useExpoRouter) {
    overlayTemplate(path.join(TEMPLATES_ROOT, 'expo-router', 'overlay'), opts.destDir, opts.vars);
    if (opts.expoSdk <= 54) {
      // expo-router 6's native tabs API differs — see the layout's comment.
      overlayTemplate(path.join(TEMPLATES_ROOT, 'expo-router', 'sdk54-overlay'), opts.destDir, opts.vars);
    }
  }
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
  if (useExpoRouter) {
    finishExpoRouterSetup(opts.destDir, {
      projectSlug: opts.vars.projectSlug,
      useReactotron: opts.useReactotron,
      useNativewind: opts.useNativewind,
    });
  }

  if (opts.pm === 'pnpm') {
    // eslint-config-expo -> eslint-import-resolver-typescript -> unrs-resolver,
    // whose postinstall only checks its prebuilt native binding is present.
    approvePnpmBuilds(opts.destDir, ['unrs-resolver']);
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
  const argv = process.argv.slice(2);
  if (argv[0] === 'add-miniapp') {
    await runAddMiniApp(argv.slice(1));
    return;
  }

  let opts;
  try {
    opts = parseCliArgs(argv);
  } catch (err) {
    if (!(err instanceof CliArgsError)) throw err;
    console.error(err.message);
    process.exit(1);
  }
  const answers = await runPrompts(opts);
  setReportAnswers(answers);
  throwIfForcedError();
  const { framework, packageManager: pm } = answers;
  const finish = (projects: Array<{ dir: string; label: string }>) =>
    maybeInstallAndFinish(projects, pm, framework, opts.install ?? (opts.yes ? true : undefined));

  if (!(await ensurePackageManagerAvailable(pm, { canPrompt: !opts.yes }))) {
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
      // runPrompts always sets it for expo.
      expoRouter: answers.expoRouter!,
      pm,
    });

    await warnIfXcodeTooOldForExpo(expoSdk);

    await finish([{ dir: destDir, label: answers.projectSlug }]);
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

    await finish([{ dir: destDir, label: answers.projectSlug }]);
    return;
  }

  // framework === 'superapp': always creates two sibling folders — host + sub-app.
  const hostSlug = `${answers.projectSlug}-host`;
  const remoteSlug = `${answers.projectSlug}-remote`;
  const baseName = toIdentifier(answers.projectSlug);
  // "super" or "host" can't be a container name, so that project's mini-app becomes "super_app".
  const remoteName = containerNameProblem(baseName) ? `${baseName}_app` : baseName;
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
    remotePort: String(FIRST_REMOTE_PORT),
    repackVersion,
  };

  await buildRnCliApp({
    appName: `${baseName}_host`,
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
  syncMiniAppFiles(hostDir, readMiniApps(hostDir));

  await buildRnCliApp({
    appName: `${baseName}_remote`,
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

  await finish([
    { dir: hostDir, label: hostSlug },
    { dir: remoteDir, label: remoteSlug },
  ]);
}

main().catch(async err => {
  p.log.error(formatCommandError(err));
  await reportError(err, 'scaffold');
  p.cancel('Something went wrong.');
  process.exit(1);
});
