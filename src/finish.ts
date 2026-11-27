import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { Framework } from './prompts.js';
import { installDependencies, formatRunCommand, formatCommandError, type PackageManager } from './packageManager.js';
import { question, spinner } from './theme.js';
import { reportError } from './errorReport.js';
import { scanApp } from './check.js';

export interface FinishedProject {
  dir: string;
  label: string;
  /** Has modules/rust-core, which must be compiled before the native build. */
  rustModule?: boolean;
}

export async function maybeInstallAndFinish(
  projects: FinishedProject[],
  pm: PackageManager,
  framework: Framework,
  /** From --install / --no-install / --yes; asked when undefined. */
  install: boolean | undefined,
  /** From --scan / --no-scan / --yes; asked when undefined. */
  scan: boolean | undefined,
) {
  const shouldInstall =
    install ??
    (await p.confirm({
      message: question(
        `Install dependencies with ${pm} now? (${projects.length} project${projects.length > 1 ? 's' : ''})`,
      ),
      initialValue: true,
    }));
  const installed = !p.isCancel(shouldInstall) && shouldInstall;

  if (installed) {
    for (const project of projects) {
      // Spinner is safe here too — see the comment in buildRnCliApp above.
      const s = spinner();
      s.start(`Running ${pm} install in ${project.label}`);
      try {
        await installDependencies(project.dir, pm);
        s.stop(`Dependencies installed in ${project.label}`);
      } catch (err) {
        s.stop(`Install failed in ${project.label}`);
        p.log.error(formatCommandError(err));
        await reportError(err, `${pm} install in ${project.label}`);
        // Keep going (the next steps are still printed), but exit non-zero so
        // scripts and CI see that the project is not ready to run.
        process.exitCode = 1;
      }
    }
  }

  const shouldScan =
    scan ??
    (await p.confirm({
      message: question('Run a store compliance scan for App Store / Google Play rejection risks?'),
      initialValue: true,
    }));
  if (!p.isCancel(shouldScan) && shouldScan) {
    // A new project's findings are reminders for later, not a failed scaffold — so no exit code.
    for (const project of projects) await scanApp(project.dir, project.label);
    p.log.info(`Scan again before submitting: npx create-dda-stack@latest check`);
  }

  const lines = [`${pc.green('Done!')} Created:`, ''];
  for (const project of projects) {
    lines.push(`  ${project.dir}`);
  }
  lines.push('');
  for (const project of projects) {
    lines.push(`cd ${path.basename(project.dir)}`);
    // `<pm> install` for every manager — `npm run install` would look for a script named install.
    if (!installed) lines.push(`  ${pm} install`);
    if (project.rustModule) {
      lines.push(
        `  ${formatRunCommand(pm, 'build:rust')}  # compiles modules/rust-core — needs Rust, cargo-ndk and the Android NDK; again after Rust changes`,
      );
    }
    if (framework === 'expo-superapp') {
      lines.push(
        '  npx expo prebuild  # generates ios/ and android/, wired to Re.Pack — run once, and again after adding native deps',
        `  ${formatRunCommand(pm, 'start')}  # Re.Pack dev server (replaces Metro / expo start) — keep it running`,
      );
    } else if (framework === 'expo') {
      lines.push('  npx expo prebuild  # generates native ios/ and android/ — run once before building natively');
    } else {
      lines.push(
        '  cd ios && bundle install && bundle exec pod install && cd ..  # run once, and again after adding native deps',
      );
    }
    // Expo superapp's ios/android scripts don't start a bundler (--no-bundler).
    const note = framework === 'expo-superapp' ? '  # in another terminal' : '';
    lines.push(`  ${formatRunCommand(pm, 'ios')}${note}`);
    lines.push(`  ${formatRunCommand(pm, 'android')}${note}`);
  }
  if (projects.length > 1) {
    // Superapp: projects[0] is the host.
    lines.push(
      '',
      `Or start every dev server in one terminal: cd ${path.basename(projects[0].dir)} && ${formatRunCommand(pm, 'dev:all')}`,
      'Otherwise, start the sub-app first, then the host — the host loads it over the network.',
    );
  }

  p.outro(lines.join('\n'));
}
