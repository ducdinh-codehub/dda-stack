#!/usr/bin/env node
/**
 * Starts the host's dev server plus one for every mini-app in miniapps.json,
 * in this one terminal:
 *
 *   npm run dev:all                    (or yarn / pnpm / bun)
 *   npm run dev:all -- --reset-cache   extra flags go to every dev server
 *
 * Each mini-app is found by looking next to this host for the folder whose
 * rspack.config.mjs declares that Module Federation name. A mini-app whose
 * port is already taken is assumed to be running already and is skipped; a
 * running host is not — stop it first, since it may predate a new mini-app.
 *
 * The host keeps this terminal's keyboard (r = reload, d = dev menu); the
 * mini-apps' output is prefixed with their name. Ctrl+C stops all of them.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import url from 'node:url';

const HOST_PORT = 8081;
const hostDir = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const extraArgs = process.argv.slice(2);
const isWindows = process.platform === 'win32';

const COLORS = [36, 35, 33, 32, 34, 91, 92, 93, 94, 95, 96];
const paint = (code, text) => (process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text);
const log = message => console.log(paint(90, '[dev:all] ') + message);

/** True if something is already listening on this port on localhost. */
function isPortInUse(port) {
  return new Promise(resolve => {
    const socket = net.connect({ port, host: 'localhost' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

/** Mini-app name -> its folder, from the sibling folders' rspack configs. */
function findMiniAppDirs() {
  const parent = path.dirname(hostDir);
  const dirs = new Map();
  for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const config = path.join(parent, entry.name, 'rspack.config.mjs');
    if (!fs.existsSync(config)) continue;
    const match = fs.readFileSync(config, 'utf8').match(/ModuleFederationPluginV2\(\{\s*name:\s*'([^']+)'/);
    if (match && match[1] !== 'host') dirs.set(match[1], path.join(parent, entry.name));
  }
  return dirs;
}

function reactNativeBin(dir) {
  const bin = path.join(dir, 'node_modules', '.bin', isWindows ? 'react-native.cmd' : 'react-native');
  return fs.existsSync(bin) ? bin : undefined;
}

const children = new Set();
// A dev server ignores SIGTERM while it's still compiling, so give them this
// long to stop before force-killing whatever is left.
const STOP_TIMEOUT_MS = 3000;

function signalAll(signal) {
  for (const child of children) {
    try {
      if (isWindows) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
      // Mini-apps run in their own process group (detached), so this also
      // stops anything they spawned.
      else process.kill(child.detached ? -child.pid : child.pid, signal);
    } catch {
      // Already gone.
    }
  }
}

let stopping = false;

async function stopAllAndExit(code) {
  if (stopping) {
    // Second Ctrl+C: don't wait.
    signalAll('SIGKILL');
    process.exit(code);
  }
  stopping = true;
  const exited = [...children].map(child => new Promise(resolve => child.once('exit', resolve)));
  signalAll('SIGTERM');
  await Promise.race([Promise.all(exited), new Promise(resolve => setTimeout(resolve, STOP_TIMEOUT_MS))]);
  signalAll('SIGKILL');
  process.exit(code);
}

/** Prefixes every line of a stream with the mini-app's name. */
function pipeWithPrefix(stream, prefix, out) {
  let buffered = '';
  stream.setEncoding('utf8');
  stream.on('data', chunk => {
    const lines = (buffered + chunk).split('\n');
    buffered = lines.pop();
    for (const line of lines) out.write(`${prefix} ${line}\n`);
  });
  stream.on('end', () => buffered && out.write(`${prefix} ${buffered}\n`));
}

function startMiniApp(app, dir, color, labelWidth) {
  const bin = reactNativeBin(dir);
  const prefix = paint(color, `[${app.name.padEnd(labelWidth)}]`);
  if (!bin) {
    log(`${app.name}: no node_modules in ${path.basename(dir)} — install its dependencies first. Skipping.`);
    return;
  }
  const child = spawn(bin, ['start', ...extraArgs], {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Own process group, so Ctrl+C in this terminal reaches only us and the
    // host — we stop the mini-apps ourselves, children included.
    detached: !isWindows,
    shell: isWindows,
    env: { ...process.env, FORCE_COLOR: process.stdout.isTTY ? '1' : '0' },
  });
  child.detached = !isWindows;
  children.add(child);
  pipeWithPrefix(child.stdout, prefix, process.stdout);
  pipeWithPrefix(child.stderr, prefix, process.stderr);
  child.on('exit', code => {
    children.delete(child);
    if (code && !stopping) log(`${app.name} exited with code ${code} — the others keep running.`);
  });
}

async function main() {
  // Checked first, and not skipped like a running mini-app: a host started
  // before a mini-app was added doesn't know about it, so reusing it would
  // leave that tab broken.
  if (await isPortInUse(HOST_PORT)) {
    log(
      `Port ${HOST_PORT} is in use — stop the host's running dev server first (Ctrl+C in its terminal), ` +
        'then run dev:all again. A host started before a mini-app was added can\'t load it.',
    );
    process.exit(1);
  }
  const hostBin = reactNativeBin(hostDir);
  if (!hostBin) {
    log("Host: no node_modules — install the host's dependencies first.");
    process.exit(1);
  }

  const miniApps = JSON.parse(fs.readFileSync(path.join(hostDir, 'miniapps.json'), 'utf8'));
  const dirs = findMiniAppDirs();
  const labelWidth = Math.max(...miniApps.map(app => app.name.length), 0);

  for (const [index, app] of miniApps.entries()) {
    const dir = dirs.get(app.name);
    if (!dir) {
      log(`${app.name}: couldn't find its folder next to ${path.basename(hostDir)} — start it yourself. Skipping.`);
    } else if (await isPortInUse(app.port)) {
      log(`${app.name}: port ${app.port} is already in use — assuming it's running. Skipping.`);
    } else {
      log(`Starting ${app.name} (${path.basename(dir)}) on port ${app.port}`);
      startMiniApp(app, dir, COLORS[index % COLORS.length], labelWidth);
    }
  }

  process.on('SIGINT', () => stopAllAndExit(130));
  process.on('SIGTERM', () => stopAllAndExit(143));
  // Last resort if this script crashes — no time to wait then.
  process.on('exit', () => signalAll('SIGKILL'));

  log(`Starting the host on port ${HOST_PORT}`);
  // Inherits this terminal, so the dev server's keyboard shortcuts still work.
  const host = spawn(hostBin, ['start', ...extraArgs], { cwd: hostDir, stdio: 'inherit', shell: isWindows });
  children.add(host);
  host.on('exit', code => {
    children.delete(host);
    // While stopping, the host exiting is expected — not a second Ctrl+C.
    if (!stopping) stopAllAndExit(code ?? 0);
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
