import { parseArgs } from 'node:util';
import type { PackageManager } from './packageManager.js';
import type { ExpoRouter, Framework, StateManagement } from './prompts.js';
import { cliVersion } from './version.js';

/**
 * Everything the interactive prompts ask for can also be passed as a flag, so
 * the CLI can run unattended (CI, scripts, AI agents). A flag always wins over
 * its prompt; with --yes, anything not passed takes the prompt's default
 * instead of being asked.
 */
export interface CliOptions {
  projectName?: string;
  framework?: Framework;
  packageManager?: PackageManager;
  stateManagement?: StateManagement;
  expoRouter?: ExpoRouter;
  reactNativeVersion?: string;
  expoSdk?: number;
  repackVersion?: string;
  useReactotron?: boolean;
  useNativewind?: boolean;
  install?: boolean;
  yes: boolean;
}

const FRAMEWORKS: Framework[] = ['rn-cli', 'expo', 'superapp'];
const PACKAGE_MANAGERS: PackageManager[] = ['npm', 'yarn', 'pnpm', 'bun'];
const STATE_MANAGEMENTS: StateManagement[] = ['none', 'zustand', 'redux-toolkit'];
const EXPO_ROUTERS: ExpoRouter[] = ['expo-router', 'react-navigation'];

const HELP = `Usage: create-dda-stack [project-name] [options]
       create-dda-stack add-miniapp [name] [options]   (see add-miniapp --help)

Options:
  --stack <stack>        rn-cli | expo | superapp
  --pm <pm>              npm | yarn | pnpm | bun
  --state <lib>          none | zustand | redux-toolkit
  --router <router>      expo-router | react-navigation (expo only)
  --rn <version>         React Native version (rn-cli only), e.g. 0.87.1
  --expo-sdk <number>    Expo SDK (expo only), e.g. 57
  --repack <version>     Re.Pack version (superapp only), e.g. 5.4.0
  --[no-]reactotron      Add Reactotron
  --[no-]nativewind      Add NativeWind (rn-cli and expo only)
  --[no-]install         Install dependencies after scaffolding
  -y, --yes              Use defaults for anything not passed instead of asking
  -h, --help             Show this help
  -v, --version          Show the version

Example:
  npm create dda-stack@latest my-app -- --stack expo --state zustand --pm pnpm --yes`;

export class CliArgsError extends Error {}

function oneOf<T extends string>(flag: string, value: string | undefined, allowed: readonly T[]): T | undefined {
  if (value === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(value)) {
    throw new CliArgsError(`--${flag} must be one of: ${allowed.join(', ')} (got "${value}")`);
  }
  return value as T;
}

/** `--x` / `--no-x` pair -> true / false / undefined (not passed). */
function toggle(flag: string, on: boolean | undefined, off: boolean | undefined): boolean | undefined {
  if (on && off) throw new CliArgsError(`--${flag} and --no-${flag} can't both be passed`);
  if (on) return true;
  if (off) return false;
  return undefined;
}

export function parseCliArgs(argv: string[]): CliOptions {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        stack: { type: 'string' },
        pm: { type: 'string' },
        state: { type: 'string' },
        router: { type: 'string' },
        rn: { type: 'string' },
        'expo-sdk': { type: 'string' },
        repack: { type: 'string' },
        // util.parseArgs only learned `--no-` negation in Node 22.4, and this
        // CLI supports Node 18 — so each negation is declared explicitly.
        reactotron: { type: 'boolean' },
        'no-reactotron': { type: 'boolean' },
        nativewind: { type: 'boolean' },
        'no-nativewind': { type: 'boolean' },
        install: { type: 'boolean' },
        'no-install': { type: 'boolean' },
        yes: { type: 'boolean', short: 'y' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (err) {
    throw new CliArgsError(`${(err as Error).message}\n\n${HELP}`);
  }
  const { values, positionals } = parsed;

  if (values.help) {
    console.log(HELP);
    process.exit(0);
  }
  if (values.version) {
    console.log(cliVersion);
    process.exit(0);
  }
  if (positionals.length > 1) {
    throw new CliArgsError(`Expected at most one project name, got: ${positionals.join(' ')}`);
  }

  const framework = oneOf('stack', values.stack, FRAMEWORKS);

  let expoSdk: number | undefined;
  if (values['expo-sdk'] !== undefined) {
    expoSdk = Number(values['expo-sdk']);
    if (!Number.isInteger(expoSdk)) {
      throw new CliArgsError(`--expo-sdk must be a whole number, e.g. 57 (got "${values['expo-sdk']}")`);
    }
  }

  // Each version flag only makes sense for one stack — reject rather than
  // silently ignore it, so a typo'd --stack doesn't produce a surprise project.
  const stackOnly: Array<[string, unknown, Framework]> = [
    ['rn', values.rn, 'rn-cli'],
    ['expo-sdk', values['expo-sdk'], 'expo'],
    ['repack', values.repack, 'superapp'],
    ['router', values.router, 'expo'],
  ];
  for (const [flag, value, only] of stackOnly) {
    if (value === undefined) continue;
    if (!framework) throw new CliArgsError(`--${flag} needs --stack ${only}`);
    if (framework !== only) throw new CliArgsError(`--${flag} only applies to --stack ${only}`);
  }

  const useNativewind = toggle('nativewind', values.nativewind, values['no-nativewind']);
  if (useNativewind && framework === 'superapp') {
    // Re.Pack bundles with Rspack, not Metro, so NativeWind's Metro plugin can't apply.
    throw new CliArgsError('--nativewind is not supported for --stack superapp');
  }

  const options: CliOptions = {
    projectName: positionals[0],
    framework,
    packageManager: oneOf('pm', values.pm, PACKAGE_MANAGERS),
    stateManagement: oneOf('state', values.state, STATE_MANAGEMENTS),
    expoRouter: oneOf('router', values.router, EXPO_ROUTERS),
    reactNativeVersion: values.rn?.trim(),
    expoSdk,
    repackVersion: values.repack,
    useReactotron: toggle('reactotron', values.reactotron, values['no-reactotron']),
    useNativewind,
    install: toggle('install', values.install, values['no-install']),
    yes: values.yes ?? false,
  };

  if (options.yes && !options.projectName) {
    throw new CliArgsError('--yes needs a project name, e.g. create-dda-stack my-app --yes');
  }
  return options;
}
