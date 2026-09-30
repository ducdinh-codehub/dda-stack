import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import * as p from '@clack/prompts';
import validateProjectName from 'validate-npm-package-name';
import { detectPackageManager, type PackageManager } from './packageManager.js';
import { renderBanner } from './banner.js';
import { question } from './theme.js';
import { REPACK_RELEASES, resolveNewestReactNative } from './repack.js';
import {
  listRecentReactNativeVersions,
  reactNativeVersionExists,
  MIN_REACT_NATIVE_MINOR,
} from './reactNativeVersions.js';
import { MIN_NATIVEWIND_REACT_NATIVE_MINOR, reactNativeMinor } from './reanimated.js';
import { listRecentExpoSdks } from './expoSdks.js';
import { getXcodeToolchain, isXcodeTooOldForExpoSdk } from './xcode.js';
import pc from 'picocolors';

// Reads this package's own version at runtime instead of hardcoding it in the
// banner, so the banner can't drift out of sync with a version bump again.
// `../package.json` resolves correctly from both `src/index.ts` (dev, via
// tsx) and the built `dist/index.js` (published) — both sit one level below
// the repo root.
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const { version: cliVersion } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

export type Framework = 'rn-cli' | 'expo' | 'superapp';

export type StateManagement = 'none' | 'zustand' | 'redux-toolkit';

export interface AnswerSet {
  projectName: string;
  projectSlug: string;
  framework: Framework;
  packageManager: PackageManager;
  useReactotron: boolean;
  useNativewind: boolean;
  stateManagement: StateManagement;
  /** Superapp only: the exact @callstack/repack version both host and sub-app install. */
  repackVersion?: string;
  /** Expo only: the SDK major version the project is created with, e.g. 57. */
  expoSdk?: number;
  /**
   * RN CLI: the version the user picked. Superapp: newest react-native that
   * `repackVersion` supports, used for both apps. Unset for Expo.
   */
  reactNativeVersion?: string;
}

// The last Re.Pack release verified end to end with this CLI's superapp
// templates — selected by default until a newer one has been scaffolded and run.
const DEFAULT_REPACK_VERSION = '5.3.0';

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
        hint: 'creates a host app + a sub-app, wired with Re.Pack + Module Federation',
      },
    ],
  });

  if (p.isCancel(framework)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  let repackVersion: string | undefined;
  let reactNativeVersion: string | undefined;
  if (framework === 'superapp') {
    const s = p.spinner();
    s.start('Checking React Native versions for each Re.Pack release');
    const releases = await Promise.all(
      REPACK_RELEASES.map(async release => ({
        ...release,
        reactNativeVersion: await resolveNewestReactNative(release),
      })),
    );
    s.stop('Checked React Native versions');

    const choice = await p.select({
      message: question('Which Re.Pack version? (React Native is picked to match)'),
      initialValue: DEFAULT_REPACK_VERSION,
      options: releases.map((release, index) => ({
        value: release.version,
        label: `Re.Pack ${release.version}`,
        hint: [
          `React Native ${release.reactNativeVersion}`,
          index === 0 ? 'latest' : undefined,
          release.version === DEFAULT_REPACK_VERSION ? 'tested' : undefined,
        ]
          .filter(Boolean)
          .join(' · '),
      })),
    });

    if (p.isCancel(choice)) {
      p.cancel('Cancelled.');
      process.exit(0);
    }

    const picked = releases.find(release => release.version === choice)!;
    repackVersion = picked.version;
    reactNativeVersion = picked.reactNativeVersion;
    p.log.info(`Using Re.Pack ${repackVersion} with React Native ${reactNativeVersion} for both apps`);
  }

  if (framework === 'rn-cli') {
    reactNativeVersion = await promptReactNativeVersion();
  }

  const expoSdk = framework === 'expo' ? await promptExpoSdk() : undefined;

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

  const stateManagement = await p.select({
    message: question('Add a state management library?'),
    initialValue: 'none',
    options: [
      { value: 'none', label: 'None' },
      { value: 'zustand', label: 'Zustand', hint: 'small, hook-based, no provider' },
      { value: 'redux-toolkit', label: 'Redux Toolkit', hint: 'Redux + react-redux, typed hooks' },
    ],
  });

  if (p.isCancel(stateManagement)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  // Not supported yet for superapp: it bundles via Re.Pack/Rspack, not Metro, so
  // NativeWind's Metro plugin doesn't apply there — don't ask a question whose
  // answer would just be silently ignored.
  // Also skipped for bare RN older than 0.78: NativeWind's Babel preset needs
  // reanimated 4, which starts there (see reanimated.ts).
  let useNativewind = false;
  const rnMinor = reactNativeVersion ? reactNativeMinor(reactNativeVersion) : undefined;
  const nativewindTooOld =
    framework === 'rn-cli' && rnMinor !== undefined && rnMinor < MIN_NATIVEWIND_REACT_NATIVE_MINOR;
  if (nativewindTooOld) {
    p.log.info(`NativeWind needs React Native 0.${MIN_NATIVEWIND_REACT_NATIVE_MINOR} or newer — skipping it.`);
  }
  if (framework !== 'superapp' && !nativewindTooOld) {
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
    stateManagement: stateManagement as StateManagement,
    expoSdk,
    repackVersion,
    reactNativeVersion,
  };
}

async function promptExpoSdk(): Promise<number> {
  const s = p.spinner();
  s.start('Checking Expo SDK versions');
  const [sdks, toolchain] = await Promise.all([listRecentExpoSdks(), getXcodeToolchain()]);
  s.stop('Checked Expo SDK versions');

  // Re-ask when the user backs out of an SDK their Xcode can't build.
  for (;;) {
    const choice = await p.select({
      message: question('Which Expo SDK?'),
      initialValue: sdks[0].sdk,
      options: sdks.map(({ sdk, reactNative }, index) => ({
        value: sdk,
        label: `SDK ${sdk}`,
        hint: [
          reactNative ? `React Native ${reactNative}` : undefined,
          index === 0 ? 'latest' : undefined,
          isXcodeTooOldForExpoSdk(sdk, toolchain) ? `needs newer Xcode than your ${toolchain!.xcodeVersion}` : undefined,
        ]
          .filter(Boolean)
          .join(' · '),
      })),
    });

    if (p.isCancel(choice)) {
      p.cancel('Cancelled.');
      process.exit(0);
    }

    const sdk = Number(choice);
    if (!isXcodeTooOldForExpoSdk(sdk, toolchain)) return sdk;

    const { xcodeVersion, swiftMajor, swiftMinor } = toolchain!;
    p.log.warn(
      [
        pc.yellow('Your Xcode is too old to build this SDK for iOS.'),
        '',
        `Expo SDK ${sdk} needs a newer Swift than Xcode ${xcodeVersion} has (Swift ${swiftMajor}.${swiftMinor}).`,
        '"expo run:ios" would fail with: xcodebuild exited with error code 65',
        `("'weak' must be a mutable variable" in expo-modules-jsi).`,
        '',
        'To fix it:',
        '  1. Update Xcode from the App Store, then open it once to finish installing',
        '  2. sudo xcode-select -s /Applications/Xcode.app',
        `  3. Check that "xcodebuild -version" no longer says ${xcodeVersion}`,
        '',
        'Or pick an older SDK. Android builds are not affected.',
      ].join('\n'),
    );

    const proceed = await p.confirm({
      message: question(`Continue with SDK ${sdk} anyway?`),
      initialValue: false,
    });
    if (p.isCancel(proceed)) {
      p.cancel('Cancelled.');
      process.exit(0);
    }
    if (proceed) return sdk;
  }
}

async function promptReactNativeVersion(): Promise<string> {
  const s = p.spinner();
  s.start('Checking React Native versions');
  const versions = await listRecentReactNativeVersions();
  s.stop('Checked React Native versions');

  const choice = await p.select({
    message: question('Which React Native version?'),
    initialValue: versions[0],
    options: [
      ...versions.map((version, index) => ({
        value: version,
        label: version,
        hint: index === 0 ? 'latest' : undefined,
      })),
      { value: 'custom', label: 'Other…', hint: `exact version, 0.${MIN_REACT_NATIVE_MINOR}.0 or newer` },
    ],
  });

  if (p.isCancel(choice)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }
  if (choice !== 'custom') return String(choice);

  // Re-ask until the version actually exists on npm — clack's `validate` is
  // synchronous, so the registry check has to happen after each answer.
  for (;;) {
    const custom = await p.text({
      message: question('React Native version?'),
      placeholder: versions[0],
      validate: value => {
        const match = /^0\.(\d+)\.\d+(-[0-9A-Za-z.-]+)?$/.exec(value?.trim() ?? '');
        if (!match) return `Enter an exact version, e.g. ${versions[0]}`;
        if (Number(match[1]) < MIN_REACT_NATIVE_MINOR) {
          return `The React Native CLI can only scaffold 0.${MIN_REACT_NATIVE_MINOR} or newer`;
        }
        return undefined;
      },
    });

    if (p.isCancel(custom)) {
      p.cancel('Cancelled.');
      process.exit(0);
    }

    const version = String(custom).trim();
    if (await reactNativeVersionExists(version)) return version;
    p.log.warn(`react-native@${version} isn't published on npm — try another version.`);
  }
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
