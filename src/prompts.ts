import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import * as p from '@clack/prompts';
import validateProjectName from 'validate-npm-package-name';
import { detectPackageManager, type PackageManager } from './packageManager.js';
import { renderBanner } from './banner.js';
import { question } from './theme.js';

// Reads this package's own version at runtime instead of hardcoding it in the
// banner, so the banner can't drift out of sync with a version bump again.
// `../package.json` resolves correctly from both `src/index.ts` (dev, via
// tsx) and the built `dist/index.js` (published) — both sit one level below
// the repo root.
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const { version: cliVersion } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

export type Framework = 'rn-cli' | 'expo' | 'superapp';

export interface AnswerSet {
  projectName: string;
  projectSlug: string;
  framework: Framework;
  packageManager: PackageManager;
  useReactotron: boolean;
  useNativewind: boolean;
}

export async function runPrompts(cliProjectName?: string): Promise<AnswerSet> {
  console.log(renderBanner('LET PLAY !', `@dda-stack-${cliVersion}`));
  p.intro('Create playground');

  const detectedPm = detectPackageManager();

  const projectName = cliProjectName ?? (await p.text({
    message: question('Project name?'),
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
    message: question('Which stack do you want to scaffold?'),
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
    message: question('Which package manager?'),
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

  const useReactotron = await p.confirm({
    message: question(
      'Install and integrate Reactotron? (You still need the Reactotron desktop app running separately — this just wires up the client and adds its config file.)',
    ),
    initialValue: false,
  });

  if (p.isCancel(useReactotron)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  // Not supported yet for superapp: it bundles via Re.Pack/Rspack, not Metro, so
  // NativeWind's Metro plugin doesn't apply there — don't ask a question whose
  // answer would just be silently ignored.
  let useNativewind = false;
  if (framework !== 'superapp') {
    const answer = await p.confirm({
      message: question('Install and integrate NativeWind (Tailwind CSS for React Native)?'),
      initialValue: false,
    });

    if (p.isCancel(answer)) {
      p.cancel('Cancelled.');
      process.exit(0);
    }
    useNativewind = answer;
  }

  return {
    projectName: String(projectName),
    projectSlug: toSlug(String(projectName)),
    framework: framework as Framework,
    packageManager: packageManager as PackageManager,
    useReactotron,
    useNativewind,
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
