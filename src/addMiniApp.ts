import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { CliArgsError } from './args.js';
import {
  detectPackageManager,
  ensurePackageManagerAvailable,
  formatCommandError,
  formatRunCommand,
  installDependencies,
  type PackageManager,
} from './packageManager.js';
import { toIdentifier, toSlug, type StateManagement } from './prompts.js';
import { assertEmptyDir, buildRnCliApp } from './rnCliApp.js';
import { MINIAPPS_FILE, nextFreePort, readMiniApps, writeMiniApps, type MiniApp } from './miniApps.js';
import { TEMPLATES_ROOT } from './scaffold.js';
import { question, spinner } from './theme.js';
import { reportError } from './errorReport.js';

const PACKAGE_MANAGERS: PackageManager[] = ['npm', 'yarn', 'pnpm', 'bun'];

const HELP = `Usage: create-dda-stack add-miniapp [name] [options]

Scaffolds a new sub-app next to a superapp host and adds it to the host's
bottom tabs (via the host's ${MINIAPPS_FILE}).

Options:
  --title <text>         Tab label and header title (default: from the name)
  --icon <emoji>         Tab icon (default: 🧩)
  --port <number>        Dev server port (default: next free one)
  --host <dir>           The host app's folder (default: found from the current folder)
  --pm <pm>              npm | yarn | pnpm | bun (default: the host's)
  --[no-]install         Install the sub-app's dependencies
  -y, --yes              Use defaults for anything not passed instead of asking
  -h, --help             Show this help

Example:
  npx create-dda-stack@latest add-miniapp payments --title Payments --icon 💳`;

interface AddMiniAppOptions {
  name?: string;
  title?: string;
  icon?: string;
  port?: number;
  host?: string;
  packageManager?: PackageManager;
  install?: boolean;
  yes: boolean;
}

function parseAddMiniAppArgs(argv: string[]): AddMiniAppOptions {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        title: { type: 'string' },
        icon: { type: 'string' },
        port: { type: 'string' },
        host: { type: 'string' },
        pm: { type: 'string' },
        install: { type: 'boolean' },
        'no-install': { type: 'boolean' },
        yes: { type: 'boolean', short: 'y' },
        help: { type: 'boolean', short: 'h' },
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
  if (positionals.length > 1) {
    throw new CliArgsError(`Expected at most one mini-app name, got: ${positionals.join(' ')}`);
  }
  if (values.install && values['no-install']) {
    throw new CliArgsError("--install and --no-install can't both be passed");
  }
  if (values.pm !== undefined && !(PACKAGE_MANAGERS as string[]).includes(values.pm)) {
    throw new CliArgsError(`--pm must be one of: ${PACKAGE_MANAGERS.join(', ')} (got "${values.pm}")`);
  }

  let port: number | undefined;
  if (values.port !== undefined) {
    port = Number(values.port);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      throw new CliArgsError(`--port must be a whole number from 1024 to 65535 (got "${values.port}")`);
    }
  }

  const options: AddMiniAppOptions = {
    name: positionals[0],
    title: values.title?.trim() || undefined,
    icon: values.icon?.trim() || undefined,
    port,
    host: values.host,
    packageManager: values.pm as PackageManager | undefined,
    install: values.install ? true : values['no-install'] ? false : undefined,
    yes: values.yes ?? false,
  };
  if (options.yes && !options.name) {
    throw new CliArgsError('--yes needs a mini-app name, e.g. create-dda-stack add-miniapp payments --yes');
  }
  return options;
}

function isHostDir(dir: string): boolean {
  const config = path.join(dir, 'rspack.config.mjs');
  return fs.existsSync(config) && fs.readFileSync(config, 'utf8').includes("name: 'host'");
}

/** --host, else the current folder, else the one `*-host` folder inside it. */
function findHostDir(hostFlag: string | undefined): string {
  const candidates = hostFlag
    ? [path.resolve(hostFlag)]
    : isHostDir(process.cwd())
      ? [process.cwd()]
      : fs
          .readdirSync(process.cwd(), { withFileTypes: true })
          .filter(entry => entry.isDirectory() && entry.name.endsWith('-host'))
          .map(entry => path.resolve(entry.name))
          .filter(isHostDir);

  if (candidates.length === 0) {
    fail(
      hostFlag
        ? `"${hostFlag}" isn't a superapp host (no rspack.config.mjs with name: 'host').`
        : 'No superapp host found. Run this inside the host app (or the folder that contains it), or pass --host <dir>.',
    );
  }
  if (candidates.length > 1) {
    fail(`Found several hosts (${candidates.map(dir => path.basename(dir)).join(', ')}) — pick one with --host <dir>.`);
  }

  const hostDir = candidates[0];
  if (!fs.existsSync(path.join(hostDir, MINIAPPS_FILE))) {
    fail(
      `${path.basename(hostDir)} has no ${MINIAPPS_FILE} — it was created with create-dda-stack 0.4.2 or older, ` +
        'before mini-apps could be added automatically. Create a new superapp with the latest version, ' +
        "or add the sub-app to the host's rspack.config.mjs remotes and RootNavigator by hand.",
    );
  }
  return hostDir;
}

function fail(message: string): never {
  p.cancel(message);
  process.exit(1);
}

function detectHostPackageManager(hostDir: string): PackageManager {
  const lockfiles: Array<[string, PackageManager]> = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lock', 'bun'],
    ['bun.lockb', 'bun'],
    ['package-lock.json', 'npm'],
  ];
  const found = lockfiles.find(([file]) => fs.existsSync(path.join(hostDir, file)));
  return found ? found[1] : detectPackageManager();
}

/**
 * The sub-app must match the host on everything shared through Module
 * Federation (React Native, Re.Pack, the state library), so read it all from
 * the host's package.json instead of asking.
 */
function readHostSetup(hostDir: string) {
  const pkg = JSON.parse(fs.readFileSync(path.join(hostDir, 'package.json'), 'utf8'));
  const deps: Record<string, string> = { ...pkg.devDependencies, ...pkg.dependencies };
  const reactNativeVersion = deps['react-native'];
  const repackVersion = deps['@callstack/repack'];
  if (!reactNativeVersion || !repackVersion) {
    fail(`Couldn't read react-native and @callstack/repack versions from ${path.basename(hostDir)}/package.json.`);
  }
  const stateManagement: StateManagement = deps.zustand
    ? 'zustand'
    : deps['@reduxjs/toolkit']
      ? 'redux-toolkit'
      : 'none';
  return {
    // Exact version, not a range — `react-native init --version` needs one.
    reactNativeVersion: reactNativeVersion.replace(/^[\^~]/, ''),
    repackVersion,
    stateManagement,
    useReactotron: Boolean(deps['reactotron-react-native']),
  };
}

function validateMiniAppName(value: string | undefined, apps: MiniApp[]): string | undefined {
  const slug = toSlug(value ?? '');
  if (!slug) return 'Mini-app name is required';
  if (!/^[a-z]/.test(slug)) return 'Mini-app name must start with a letter';
  const name = toIdentifier(slug);
  if (name === 'host') return '"host" is reserved for the host app';
  if (apps.some(app => app.name === name)) return `The host already has a mini-app named "${name}"`;
  return undefined;
}

function defaultTitle(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

export async function runAddMiniApp(argv: string[]) {
  let opts: AddMiniAppOptions;
  try {
    opts = parseAddMiniAppArgs(argv);
  } catch (err) {
    if (!(err instanceof CliArgsError)) throw err;
    console.error(err.message);
    process.exit(1);
  }

  p.intro('Add a mini-app');

  const hostDir = findHostDir(opts.host);
  const apps = readMiniApps(hostDir);
  const host = readHostSetup(hostDir);

  let rawName = opts.name;
  if (rawName === undefined) {
    const answer = await p.text({
      message: question('Mini-app name?'),
      placeholder: 'payments',
      validate: value => validateMiniAppName(value, apps),
    });
    if (p.isCancel(answer)) fail('Cancelled.');
    rawName = answer;
  } else {
    const error = validateMiniAppName(rawName, apps);
    if (error) fail(error);
  }
  const slug = toSlug(rawName);
  const name = toIdentifier(slug);

  let title = opts.title;
  if (title === undefined && !opts.yes) {
    const answer = await p.text({
      message: question('Tab title?'),
      initialValue: defaultTitle(slug),
      validate: value => (value?.trim() ? undefined : 'Tab title is required'),
    });
    if (p.isCancel(answer)) fail('Cancelled.');
    title = answer.trim();
  }
  title ??= defaultTitle(slug);

  const port = opts.port ?? nextFreePort(apps);
  const usedBy = apps.find(app => app.port === port);
  if (usedBy) fail(`Port ${port} is already used by the "${usedBy.name}" mini-app — pick another with --port.`);

  const projectSlug = path.basename(hostDir).replace(/-host$/, '');
  const remoteDir = path.join(path.dirname(hostDir), `${projectSlug}-${slug}`);
  assertEmptyDir(remoteDir);

  const pm = opts.packageManager ?? detectHostPackageManager(hostDir);
  if (!(await ensurePackageManagerAvailable(pm, { canPrompt: !opts.yes }))) {
    fail(`${pm} is required but not available. Re-run with --pm <pm>, or install ${pm} first.`);
  }

  const remoteLabel = path.basename(remoteDir);
  await buildRnCliApp({
    appName: `${name}_remote`,
    destDir: remoteDir,
    pm,
    vars: {
      projectName: title,
      projectSlug,
      remoteName: name,
      remotePort: String(port),
      repackVersion: host.repackVersion,
    },
    overlayDir: path.join(TEMPLATES_ROOT, 'superapp', 'remote-overlay'),
    label: `${remoteLabel} (sub-app)`,
    useReactotron: host.useReactotron,
    useNativewind: false,
    stateManagement: host.stateManagement,
    reactNativeVersion: host.reactNativeVersion,
  });

  // Only after the sub-app exists, so a failed scaffold leaves the host untouched.
  writeMiniApps(hostDir, [...apps, { name, title, icon: opts.icon ?? '🧩', port, prodUrl: '' }]);
  p.log.success(`Added a "${title}" tab to ${path.basename(hostDir)}`);

  const shouldInstall =
    opts.install ??
    (opts.yes
      ? true
      : await p.confirm({ message: question(`Install dependencies with ${pm} now?`), initialValue: true }));
  const installed = !p.isCancel(shouldInstall) && shouldInstall;
  if (installed) {
    const s = spinner();
    s.start(`Running ${pm} install in ${remoteLabel}`);
    try {
      await installDependencies(remoteDir, pm);
      s.stop(`Dependencies installed in ${remoteLabel}`);
    } catch (err) {
      s.stop(`Install failed in ${remoteLabel}`);
      p.log.error(formatCommandError(err));
      await reportError(err, `${pm} install in ${remoteLabel}`);
      process.exitCode = 1;
    }
  }

  const hostLabel = path.basename(hostDir);
  // npm needs `--` to pass flags through to the script; the others don't.
  const restartHost = `${formatRunCommand(pm, 'start')}${pm === 'npm' ? ' --' : ''} --reset-cache`;

  // Printed on its own, not inside the outro, so it isn't lost among the
  // next steps — skipping it is the most common way this goes wrong.
  p.log.warn(
    [
      pc.bold(pc.yellow(`Restart ${hostLabel}'s dev server to load the new tab.`)),
      `It only reads ${MINIAPPS_FILE} at startup — until it's restarted, the tab shows`,
      `"Cannot find module '${name}/HomeScreen'". Reloading the app isn't enough.`,
    ].join('\n'),
  );

  const lines = [
    `${pc.green('Done!')} Created:`,
    '',
    `  ${remoteDir}`,
    '',
    `cd ${remoteLabel}`,
    ...(installed ? [] : [`  ${formatRunCommand(pm, 'install')}`]),
    `  ${formatRunCommand(pm, 'start')}  # serves the mini-app on port ${port}`,
    '',
    `cd ${hostLabel}`,
    `  ${restartHost}  # stop the running dev server first (Ctrl+C)`,
    '',
    `Change the tab's title or icon, or set a production URL, in ${hostLabel}/${MINIAPPS_FILE}.`,
  ];
  p.outro(lines.join('\n'));
}
