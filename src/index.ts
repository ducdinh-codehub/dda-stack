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
  type PackageManager,
} from './packageManager.js';
import { overlayTemplate, TEMPLATES_ROOT, type TemplateVars } from './scaffold.js';
import { initReactNativeCli, initExpo } from './nativeInit.js';

const REMOTE_DEV_PORT = 9003;

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
}) {
  // No spinner here: the generator runs with inherited stdio and can show its own
  // interactive prompts, which would fight an animated spinner for the terminal.
  p.log.step(`Generating native project for ${opts.label}`);
  await initReactNativeCli(opts.appName, opts.destDir, opts.pm);
  p.log.success(`Native project generated for ${opts.label}`);

  overlayTemplate(path.join(TEMPLATES_ROOT, 'common'), opts.destDir, opts.vars);
  overlayTemplate(opts.overlayDir, opts.destDir, opts.vars);
}

async function buildExpoApp(opts: {
  appName: string;
  destDir: string;
  vars: TemplateVars;
  label: string;
}) {
  // No spinner here — see the comment in buildRnCliApp above.
  p.log.step(`Generating Expo project for ${opts.label}`);
  await initExpo(opts.appName, opts.destDir);
  p.log.success(`Expo project generated for ${opts.label}`);

  overlayTemplate(path.join(TEMPLATES_ROOT, 'common'), opts.destDir, opts.vars);
  overlayTemplate(path.join(TEMPLATES_ROOT, 'expo', 'overlay'), opts.destDir, opts.vars);
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
  });

  await buildRnCliApp({
    appName: `${remoteName}_remote`,
    destDir: remoteDir,
    pm,
    vars: sharedVars,
    overlayDir: path.join(TEMPLATES_ROOT, 'superapp', 'remote-overlay'),
    label: `${remoteSlug} (sub-app)`,
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
    message: `Install dependencies with ${pm} now? (${projects.length} project${projects.length > 1 ? 's' : ''})`,
    initialValue: true,
  });

  if (!p.isCancel(shouldInstall) && shouldInstall) {
    for (const project of projects) {
      // No spinner: the install command runs with inherited stdio and prints its
      // own live progress, which would fight an animated spinner for the terminal.
      p.log.step(`Running ${pm} install in ${project.label}`);
      try {
        await installDependencies(project.dir, pm);
        p.log.success(`Dependencies installed in ${project.label}`);
      } catch (err) {
        p.log.error(`Install failed in ${project.label}`);
        p.log.error(String(err));
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
  console.error(err);
  process.exit(1);
});
