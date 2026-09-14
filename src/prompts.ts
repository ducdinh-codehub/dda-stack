import * as p from '@clack/prompts';
import validateProjectName from 'validate-npm-package-name';
import { detectPackageManager, type PackageManager } from './packageManager.js';
import { renderBanner } from './banner.js';

export type Framework = 'rn-cli' | 'expo' | 'superapp';

export interface AnswerSet {
  projectName: string;
  projectSlug: string;
  framework: Framework;
  packageManager: PackageManager;
}

export async function runPrompts(cliProjectName?: string): Promise<AnswerSet> {
  console.log(renderBanner('LET PLAY !'));
  p.intro('create-dda-stack');

  const detectedPm = detectPackageManager();

  const projectName = cliProjectName ?? (await p.text({
    message: 'Project name?',
    placeholder: 'my-app',
    validate: value => {
      if (!value) return 'Project name is required';
      const { validForNewPackages, errors } = validateProjectName(toSlug(value));
      if (!validForNewPackages) return errors?.[0] ?? 'Invalid project name';
      return undefined;
    },
  }));

  if (p.isCancel(projectName)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  const framework = await p.select({
    message: 'Which stack do you want to scaffold?',
    options: [
      { value: 'rn-cli', label: 'React Native CLI', hint: 'bare workflow, full native control' },
      { value: 'expo', label: 'Expo', hint: 'managed workflow, fastest to start' },
      {
        value: 'superapp',
        label: 'Superapp (Module Federation)',
        hint: 'creates a host app + a sub-app, Re.Pack + Module Federation, matches vc_app_v2_platform',
      },
    ],
  });

  if (p.isCancel(framework)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  const packageManager = await p.select({
    message: 'Which package manager?',
    initialValue: detectedPm,
    options: [
      { value: 'npm', label: 'npm' },
      { value: 'yarn', label: 'yarn' },
      { value: 'pnpm', label: 'pnpm' },
      { value: 'bun', label: 'bun' },
    ],
  });

  if (p.isCancel(packageManager)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  return {
    projectName: String(projectName),
    projectSlug: toSlug(String(projectName)),
    framework: framework as Framework,
    packageManager: packageManager as PackageManager,
  };
}

export function toSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** MF container names must be safe JS identifiers ("mini-card" -> "mini_card"). */
export function toIdentifier(slug: string): string {
  return slug.replace(/-/g, '_');
}
