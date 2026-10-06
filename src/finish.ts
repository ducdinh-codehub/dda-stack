import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { Framework } from './prompts.js';
import { installDependencies, formatRunCommand, formatCommandError, type PackageManager } from './packageManager.js';
import { question, spinner } from './theme.js';
import { reportError } from './errorReport.js';

export async function maybeInstallAndFinish(
  projects: Array<{ dir: string; label: string }>,
  pm: PackageManager,
  framework: Framework,
  /** From --install / --no-install / --yes; asked when undefined. */
  install: boolean | undefined,
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
    // Superapp: projects[0] is the host.
    lines.push(
      '',
      `Or start every dev server in one terminal: cd ${path.basename(projects[0].dir)} && ${formatRunCommand(pm, 'dev:all')}`,
      'Otherwise, start the sub-app first, then the host — the host loads it over the network.',
    );
  }

  p.outro(lines.join('\n'));
}
