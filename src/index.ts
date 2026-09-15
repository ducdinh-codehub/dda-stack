#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { runPrompts, toIdentifier, type Framework } from './prompts.js';
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

const REMOTE_DEV_PORT = 9003;

// react-native version pinned for the superapp (repack) flow — see the
// reactNativeVersion comment on initReactNativeCli in nativeInit.ts for why.
const SUPERAPP_REACT_NATIVE_VERSION = '0.86.0';

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
  }
}

async function buildExpoApp(opts: {
  appName: string;
  destDir: string;
  vars: TemplateVars;
  label: string;
  useReactotron: boolean;
  useNativewind: boolean;
}) {
  // No spinner here specifically: this step inherits stdio on purpose (Expo's
  // generator can show its own interactive prompt, e.g. picking an SDK version),
  // and an animated spinner would fight it for the terminal — see initExpo().
  p.log.step(`Generating Expo project for ${opts.label}`);
  await initExpo(opts.appName, opts.destDir);
  p.log.success(`Expo project generated for ${opts.label}`);

  overlayTemplate(path.join(TEMPLATES_ROOT, 'common'), opts.destDir, opts.vars);
  overlayTemplate(path.join(TEMPLATES_ROOT, 'expo', 'overlay'), opts.destDir, opts.vars);
  if (opts.useReactotron) {
    overlayTemplate(path.join(TEMPLATES_ROOT, 'reactotron', 'overlay'), opts.destDir, opts.vars);
  }
  if (opts.useNativewind) {
    overlayTemplate(path.join(TEMPLATES_ROOT, 'nativewind', 'expo-overlay'), opts.destDir, opts.vars);
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

    await buildExpoApp({
      appName: answers.projectName,
      destDir,
      vars: { projectName: answers.projectName, projectSlug: answers.projectSlug },
      label: answers.projectName,
      useReactotron: answers.useReactotron,
      useNativewind: answers.useNativewind,
    });

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
      label: answers.projectName,
      useReactotron: answers.useReactotron,
      useNativewind: answers.useNativewind,
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

  const sharedVars: TemplateVars = {
    projectName: answers.projectName,
    projectSlug: answers.projectSlug,
    remoteName,
    remotePort: String(REMOTE_DEV_PORT),
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
    reactNativeVersion: SUPERAPP_REACT_NATIVE_VERSION,
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
    reactNativeVersion: SUPERAPP_REACT_NATIVE_VERSION,
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
