import * as p from '@clack/prompts';
import validateProjectName from 'validate-npm-package-name';
import { detectPackageManager, type PackageManager } from './packageManager.js';
import { renderBanner } from './banner.js';
import { question, spinner } from './theme.js';
import { REPACK_RELEASES, resolveNewestReactNative } from './repack.js';
import {
  listRecentReactNativeVersions,
  reactNativeVersionExists,
  MIN_REACT_NATIVE_MINOR,
} from './reactNativeVersions.js';
import { MIN_NATIVEWIND_REACT_NATIVE_MINOR, reactNativeMinor } from './reanimated.js';
import { listRecentExpoSdks, MIN_EXPO_SDK } from './expoSdks.js';
import { getXcodeToolchain, isXcodeTooOldForExpoSdk } from './xcode.js';
import { cliVersion } from './version.js';
import type { CliOptions } from './args.js';
import pc from 'picocolors';

export type Framework = 'rn-cli' | 'expo' | 'superapp';

export type StateManagement = 'none' | 'zustand' | 'redux-toolkit';

export type ExpoRouter = 'expo-router' | 'react-navigation';

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
  /** Expo only: file-based routing (Expo Router) or a React Navigation navigator. */
  expoRouter?: ExpoRouter;
  /**
   * RN CLI: the version the user picked. Superapp: newest react-native that
   * `repackVersion` supports, used for both apps. Unset for Expo.
   */
  reactNativeVersion?: string;
}

// The last Re.Pack release verified end to end with this CLI's superapp
// templates — selected by default until a newer one has been scaffolded and run.
const DEFAULT_REPACK_VERSION = '5.3.0';

/** Unwraps a prompt answer, exiting cleanly if the user cancelled (Ctrl+C / Esc). */
function answered<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }
  return value;
}

/** A flag value that can't be used — there's no prompt to fall back to, so stop. */
function invalidFlag(message: string): never {
  p.cancel(message);
  process.exit(1);
}

function validateProjectNameInput(value: string | undefined): string | undefined {
  if (!value) return 'Project name is required';
  const { validForNewPackages, errors } = validateProjectName(toSlug(value));
  if (!validForNewPackages) return errors?.[0] ?? 'Invalid project name';
  return undefined;
}

function validateReactNativeVersionInput(value: string | undefined, example: string): string | undefined {
  const match = /^0\.(\d+)\.\d+(-[0-9A-Za-z.-]+)?$/.exec(value?.trim() ?? '');
  if (!match) return `Enter an exact version, e.g. ${example}`;
  if (Number(match[1]) < MIN_REACT_NATIVE_MINOR) {
    return `The React Native CLI can only scaffold 0.${MIN_REACT_NATIVE_MINOR} or newer`;
  }
  return undefined;
}

export async function runPrompts(opts: CliOptions): Promise<AnswerSet> {
  console.log(renderBanner('LET PLAY !', `@dda-stack-${cliVersion}`));
  p.intro('Create playground');

  const detectedPm = detectPackageManager();

  let projectName: string;
  if (opts.projectName !== undefined) {
    const error = validateProjectNameInput(opts.projectName);
    if (error) invalidFlag(`Invalid project name "${opts.projectName}": ${error}`);
    projectName = opts.projectName;
  } else {
    projectName = answered(
      await p.text({
        message: question('Project name?'),
        placeholder: 'my-app',
        validate: validateProjectNameInput,
      }),
    );
  }

  const framework: Framework =
    opts.framework ??
    (opts.yes
      ? 'rn-cli'
      : answered(
          await p.select<Framework>({
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
          }),
        ));

  let repackVersion: string | undefined;
  let reactNativeVersion: string | undefined;
  if (framework === 'superapp') {
    ({ repackVersion, reactNativeVersion } = await resolveRepack(opts));
    p.log.info(`Using Re.Pack ${repackVersion} with React Native ${reactNativeVersion} for both apps`);
  }

  if (framework === 'rn-cli') {
    reactNativeVersion = await resolveReactNativeVersion(opts);
  }

  const expoSdk = framework === 'expo' ? await resolveExpoSdk(opts) : undefined;

  const expoRouter: ExpoRouter | undefined =
    framework !== 'expo'
      ? undefined
      : (opts.expoRouter ??
        (opts.yes
          ? 'expo-router'
          : answered(
              await p.select<ExpoRouter>({
                message: question('How should navigation work?'),
                initialValue: 'expo-router',
                options: [
                  { value: 'expo-router', label: 'Expo Router', hint: 'file-based routes in app/, Expo’s default' },
                  { value: 'react-navigation', label: 'React Navigation', hint: 'a navigator defined in code' },
                ],
              }),
            )));

  const packageManager: PackageManager =
    opts.packageManager ??
    (opts.yes
      ? detectedPm
      : answered(
          await p.select<PackageManager>({
            message: question('Which package manager?'),
            initialValue: detectedPm,
            options: [
              { value: 'npm', label: 'npm' },
              { value: 'yarn', label: 'yarn' },
              { value: 'pnpm', label: 'pnpm' },
              { value: 'bun', label: 'bun' },
            ],
          }),
        ));

  const useReactotron =
    opts.useReactotron ??
    (opts.yes
      ? false
      : answered(
          await p.confirm({
            message: question(
              'Install and integrate Reactotron? (You still need the Reactotron desktop app running separately — this just wires up the client and adds its config file.)',
            ),
            initialValue: false,
          }),
        ));

  const stateManagement: StateManagement =
    opts.stateManagement ??
    (opts.yes
      ? 'none'
      : answered(
          await p.select<StateManagement>({
            message: question('Add a state management library?'),
            initialValue: 'none',
            options: [
              { value: 'none', label: 'None' },
              { value: 'zustand', label: 'Zustand', hint: 'small, hook-based, no provider' },
              { value: 'redux-toolkit', label: 'Redux Toolkit', hint: 'Redux + react-redux, typed hooks' },
            ],
          }),
        ));

  // Not supported yet for superapp: it bundles via Re.Pack/Rspack, not Metro, so
  // NativeWind's Metro plugin doesn't apply there — don't ask a question whose
  // answer would just be silently ignored. (args.ts rejects --nativewind there.)
  // Also skipped for bare RN older than 0.78: NativeWind's Babel preset needs
  // reanimated 4, which starts there (see reanimated.ts).
  let useNativewind = false;
  const rnMinor = reactNativeVersion ? reactNativeMinor(reactNativeVersion) : undefined;
  const nativewindTooOld =
    framework === 'rn-cli' && rnMinor !== undefined && rnMinor < MIN_NATIVEWIND_REACT_NATIVE_MINOR;
  if (nativewindTooOld) {
    if (opts.useNativewind) {
      invalidFlag(`--nativewind needs React Native 0.${MIN_NATIVEWIND_REACT_NATIVE_MINOR} or newer`);
    }
    p.log.info(`NativeWind needs React Native 0.${MIN_NATIVEWIND_REACT_NATIVE_MINOR} or newer — skipping it.`);
  }
  if (framework !== 'superapp' && !nativewindTooOld) {
    useNativewind =
      opts.useNativewind ??
      (opts.yes
        ? false
        : answered(
            await p.confirm({
              message: question('Install and integrate NativeWind (Tailwind CSS for React Native)?'),
              initialValue: false,
            }),
          ));
  }

  return {
    projectName,
    projectSlug: toSlug(projectName),
    framework,
    packageManager,
    useReactotron,
    useNativewind,
    stateManagement,
    expoSdk,
    expoRouter,
    repackVersion,
    reactNativeVersion,
  };
}

async function resolveRepack(opts: CliOptions): Promise<{ repackVersion: string; reactNativeVersion: string }> {
  // Flag or --yes: only one release is needed, so skip resolving every row.
  const preset = opts.repackVersion ?? (opts.yes ? DEFAULT_REPACK_VERSION : undefined);
  if (preset !== undefined) {
    const release = REPACK_RELEASES.find(r => r.version === preset);
    if (!release) {
      invalidFlag(
        `--repack must be one of: ${REPACK_RELEASES.map(r => r.version).join(', ')} (got "${preset}")`,
      );
    }
    return { repackVersion: release.version, reactNativeVersion: await resolveNewestReactNative(release) };
  }

  const s = spinner();
  s.start('Checking React Native versions for each Re.Pack release');
  const releases = await Promise.all(
    REPACK_RELEASES.map(async release => ({
      ...release,
      reactNativeVersion: await resolveNewestReactNative(release),
    })),
  );
  s.stop('Checked React Native versions');

  const choice = answered(
    await p.select({
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
    }),
  );

  const picked = releases.find(release => release.version === choice)!;
  return { repackVersion: picked.version, reactNativeVersion: picked.reactNativeVersion };
}

async function resolveExpoSdk(opts: CliOptions): Promise<number> {
  if (opts.expoSdk !== undefined) {
    if (opts.expoSdk < MIN_EXPO_SDK) invalidFlag(`--expo-sdk must be ${MIN_EXPO_SDK} or newer`);
    // No Xcode confirmation here: the flag is an explicit choice, and index.ts
    // still warns after scaffolding if this Xcode can't build it.
    return opts.expoSdk;
  }

  const s = spinner();
  s.start('Checking Expo SDK versions');
  const [sdks, toolchain] = await Promise.all([listRecentExpoSdks(), getXcodeToolchain()]);
  s.stop('Checked Expo SDK versions');

  if (opts.yes) return sdks[0].sdk;

  // Re-ask when the user backs out of an SDK their Xcode can't build.
  for (;;) {
    const sdk = answered(
      await p.select({
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
      }),
    );

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

    const proceed = answered(
      await p.confirm({
        message: question(`Continue with SDK ${sdk} anyway?`),
        initialValue: false,
      }),
    );
    if (proceed) return sdk;
  }
}

async function resolveReactNativeVersion(opts: CliOptions): Promise<string> {
  if (opts.reactNativeVersion !== undefined) {
    const version = opts.reactNativeVersion;
    const error = validateReactNativeVersionInput(version, '0.87.1');
    if (error) invalidFlag(`--rn: ${error}`);
    if (!(await reactNativeVersionExists(version))) {
      invalidFlag(`--rn: react-native@${version} isn't published on npm`);
    }
    return version;
  }

  const s = spinner();
  s.start('Checking React Native versions');
  const versions = await listRecentReactNativeVersions();
  s.stop('Checked React Native versions');

  if (opts.yes) return versions[0];

  const choice = answered(
    await p.select({
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
    }),
  );
  if (choice !== 'custom') return choice;

  // Re-ask until the version actually exists on npm — clack's `validate` is
  // synchronous, so the registry check has to happen after each answer.
  for (;;) {
    const custom = answered(
      await p.text({
        message: question('React Native version?'),
        placeholder: versions[0],
        validate: value => validateReactNativeVersionInput(value, versions[0]),
      }),
    );

    const version = custom.trim();
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
