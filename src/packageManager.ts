import { execa } from 'execa';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as p from '@clack/prompts';
import { question } from './theme.js';

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

const PACKAGE_MANAGERS: PackageManager[] = ['npm', 'yarn', 'pnpm', 'bun'];

/**
 * npm_config_user_agent looks like "pnpm/9.1.0 npm/? node/v20.11.0 darwin x64"
 * when the CLI was invoked via `pnpm create ...` / `yarn create ...` / etc.
 */
export function detectPackageManager(): PackageManager {
  const userAgent = process.env.npm_config_user_agent ?? '';
  const match = PACKAGE_MANAGERS.find(pm => userAgent.startsWith(pm));
  return match ?? 'npm';
}

const INSTALL_ARGS: Record<PackageManager, string[]> = {
  npm: ['install'],
  yarn: [],
  pnpm: ['install'],
  bun: ['install'],
};

const DLX_PREFIX: Record<PackageManager, string[]> = {
  npm: ['npx', '--yes'],
  yarn: ['yarn', 'dlx'],
  pnpm: ['pnpm', 'dlx'],
  bun: ['bunx'],
};

// Both of these capture output instead of streaming it to the terminal (execa's
// default `stdio`) — the underlying tools are noisy (banners, progress bars,
// dependency listings) and none of that is interactive input we'd need to relay.
// On failure the caller can still surface `err.all` for debugging.

export async function installDependencies(projectDir: string, pm: PackageManager) {
  if (pm === 'yarn') {
    // Yarn Berry treats the nearest ancestor directory with its own package.json
    // as this project's root unless projectDir is declared as one of its
    // workspaces or has its own lockfile — which fails whenever the generated
    // project happens to sit inside another yarn/npm-managed directory (e.g.
    // this CLI's own repo during local testing, or a company monorepo). An empty
    // yarn.lock marks it as self-contained, per Yarn's own suggested fix.
    const lockfilePath = path.join(projectDir, 'yarn.lock');
    if (!fs.existsSync(lockfilePath)) {
      fs.writeFileSync(lockfilePath, '');
    }
  }

  await execa(pm, INSTALL_ARGS[pm], {
    cwd: projectDir,
    all: true,
  });
}

/** Runs a one-off package binary (e.g. the official RN CLI / Expo init) without installing it globally. */
export async function runDlx(
  pm: PackageManager,
  pkgAndArgs: string[],
  cwd: string,
  opts?: {
    timeout?: number;
    // Some generators (create-expo-app, at least) can show their own interactive
    // prompt (e.g. picking an SDK version) — inherit stdio so it's actually
    // visible and answerable, instead of hanging on unreadable/unanswerable
    // piped stdin. Only opt into this where that's a known possibility.
    interactive?: boolean;
  },
) {
  const [prefixCmd, ...prefixArgs] = DLX_PREFIX[pm];
  await execa(prefixCmd, [...prefixArgs, ...pkgAndArgs], {
    cwd,
    timeout: opts?.timeout,
    ...(opts?.interactive ? { stdio: 'inherit' } : { all: true }),
  });
}

async function isCommandAvailable(cmd: string): Promise<boolean> {
  try {
    await execa(process.platform === 'win32' ? 'where' : 'which', [cmd]);
    return true;
  } catch {
    return false;
  }
}

/** Where the official bun installer places the binary (respects a custom BUN_INSTALL). */
function bunInstallBinDir(): string {
  return path.join(process.env.BUN_INSTALL ?? path.join(os.homedir(), '.bun'), 'bin');
}

async function isBunAvailable(): Promise<boolean> {
  if (await isCommandAvailable('bun')) return true;

  // The installer only edits the shell profile for *future* shells to pick up
  // PATH — a session that was already open before installing (or any shell that
  // doesn't re-source that profile) will keep failing the PATH-based check above
  // forever, even though bun is genuinely installed. Fall back to checking its
  // well-known install location directly, and patch PATH for this process if found.
  const dir = bunInstallBinDir();
  const bunBin = path.join(dir, process.platform === 'win32' ? 'bun.exe' : 'bun');
  if (fs.existsSync(bunBin)) {
    process.env.PATH = `${dir}${path.delimiter}${process.env.PATH ?? ''}`;
    return true;
  }
  return false;
}

const COREPACK_PACKAGE: Record<'yarn' | 'pnpm', string> = {
  yarn: 'yarn@stable',
  pnpm: 'pnpm@latest',
};

/**
 * npm always ships with Node, so it's never missing. yarn/pnpm are activated
 * through Node's built-in corepack shim — no separate download/installer, no
 * shell profile edits, so it's safe to do without asking. bun has no corepack
 * shim; its installer is a `curl | bash` that edits the shell profile, so that
 * one needs an explicit yes from the user first.
 */
export async function ensurePackageManagerAvailable(pm: PackageManager): Promise<boolean> {
  if (pm === 'npm') return true;
  if (pm === 'bun') return (await isBunAvailable()) || installBun();
  if (await isCommandAvailable(pm)) return true;

  return installViaCorepack(pm);
}

async function installViaCorepack(pm: 'yarn' | 'pnpm'): Promise<boolean> {
  const s = p.spinner();
  s.start(`${pm} not found — activating via corepack`);
  try {
    await execa('corepack', ['enable'], { stdio: 'ignore' });
    await execa('corepack', ['prepare', COREPACK_PACKAGE[pm], '--activate'], { stdio: 'ignore' });
    s.stop(`${pm} activated via corepack`);
    return true;
  } catch (err) {
    s.stop(`Could not activate ${pm} via corepack`);
    p.log.error(String(err));
    return false;
  }
}

async function installBun(): Promise<boolean> {
  const shouldInstall = await p.confirm({
    message: question('bun is not installed. Install it now via the official installer (curl | bash)?'),
    initialValue: true,
  });
  if (p.isCancel(shouldInstall) || !shouldInstall) return false;

  const s = p.spinner();
  s.start('Installing bun');
  try {
    if (process.platform === 'win32') {
      await execa('powershell', ['-c', 'irm bun.sh/install.ps1 | iex'], { stdio: 'ignore' });
    } else {
      await execa('bash', ['-c', 'curl -fsSL https://bun.sh/install | bash'], { stdio: 'ignore' });
    }
  } catch (err) {
    s.stop('bun installation failed');
    p.log.error(String(err));
    return false;
  }

  const ok = await isBunAvailable();
  s.stop(ok ? 'bun installed' : 'bun installation finished, but bun is still not on PATH');
  return ok;
}

/** Extracts the most useful debugging text from a failed execa call — its
 *  captured output, not just the generic "Command failed with exit code 1". */
export function formatCommandError(err: unknown): string {
  if (err && typeof err === 'object' && 'shortMessage' in err) {
    const e = err as { shortMessage?: string; all?: string; stderr?: string };
    const output = e.all || e.stderr;
    return output ? `${e.shortMessage}\n\n${output}` : String(e.shortMessage ?? err);
  }
  return String(err);
}

export function formatRunCommand(pm: PackageManager, script: string): string {
  switch (pm) {
    case 'npm':
      return `npm run ${script}`;
    case 'yarn':
      return `yarn ${script}`;
    case 'pnpm':
      return `pnpm ${script}`;
    case 'bun':
      return `bun run ${script}`;
  }
}
