import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import * as p from '@clack/prompts';
import { runDlx } from './packageManager.js';
import type { PackageManager } from './packageManager.js';

/**
 * Native Android/iOS project files (Xcode .pbxproj, Gradle, AppDelegate/MainActivity)
 * are not hand-maintained as static template files here — they're too easy to corrupt
 * by hand and drift from upstream RN/Expo releases. Instead we shell out to the
 * official generators into a scratch dir, then the caller overlays our own
 * src/ + config templates on top of the result.
 */

/** `projectName` must be a plain identifier (letters/digits/underscore) — the native
 *  CLI rejects spaces and hyphens, so callers should pass an identifier-safe name
 *  (e.g. via `toIdentifier`), not a raw display name. */
export async function initReactNativeCli(
  projectName: string,
  destDir: string,
  pm: PackageManager,
) {
  const scratchParent = fs.mkdtempSync(path.join(os.tmpdir(), 'dda-stack-'));
  await runDlx(
    // Always invoke the one-off generator via npm's dlx (npx), regardless of the
    // user's chosen `pm` — it ships with every Node.js install unconditionally, and
    // we always pass --skip-install below anyway (the real install of the user's
    // actual dependencies happens later via their real `pm`). This sidesteps
    // dlx-runner-specific bugs (e.g. bunx: https://github.com/oven-sh/bun/issues/24538,
    // which leaves generator processes hanging after they've already finished).
    'npm',
    [
      // `react-native init` was removed from the `react-native` package itself;
      // it now lives in @react-native-community/cli (react-native@0.87+).
      '@react-native-community/cli@latest',
      'init',
      projectName,
      '--directory',
      destDir,
      '--skip-install',
      '--skip-git-init',
      '--pm',
      // The native CLI's --pm only recognizes npm/yarn/bun — pnpm isn't a valid
      // value and silently no-ops the whole init if passed. We always pass
      // --skip-install anyway (the real install happens later via `pm`), so this
      // only needs to satisfy that check, not reflect the user's actual choice.
      pm === 'pnpm' ? 'npm' : pm,
    ],
    scratchParent,
  );
  fs.rmSync(scratchParent, { recursive: true, force: true });
}

export async function initExpo(projectName: string, destDir: string) {
  const parentDir = path.dirname(destDir);
  fs.mkdirSync(parentDir, { recursive: true });

  try {
    await runDlx(
      // Always npm's dlx (npx) — see the comment in initReactNativeCli above for why.
      'npm',
      [
        'create-expo-app@latest',
        destDir,
        '--template',
        'blank-typescript',
        '--no-install',
        '--no-agents-md',
      ],
      parentDir,
      // Defensive safety net: generous vs. the ~5-30s this normally takes (even on
      // a slow network/big download), in case a dlx runner ever leaves the
      // generator process hanging after it's already finished writing the project.
      { timeout: 60_000 },
    );
  } catch (err) {
    const timedOut = (err as { timedOut?: boolean }).timedOut === true;
    if (!timedOut || !fs.existsSync(path.join(destDir, 'app.json'))) {
      throw err;
    }
    p.log.warn(
      'The Expo generator did not exit after finishing (npm did not report completion in time) — continuing anyway.',
    );
  }

  // create-expo-app has no --skip-git-init flag — it always inits a repo. Strip it
  // so git init happens at the point the user actually wants it, matching the
  // --skip-git-init behavior used for the RN CLI path.
  fs.rmSync(path.join(destDir, '.git'), { recursive: true, force: true });

  // The project name/path passed above is used as the folder name, which
  // create-expo-app also uses as app.json's display name — there's no separate
  // flag for a human-readable name, so patch it in afterward.
  const appJsonPath = path.join(destDir, 'app.json');
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  appJson.expo.name = projectName;
  fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');
}
