import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
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
    // Defensive: the generator's own output is captured rather than streamed, so
    // if it ever shows an interactive prompt we can't relay (e.g. an "already
    // exists" confirmation — not expected here since callers check the target
    // directory is empty first, but this bounds it instead of hanging forever).
    { timeout: 60_000 },
  );
  fs.rmSync(scratchParent, { recursive: true, force: true });
}

export async function initExpo(projectName: string, destDir: string) {
  const parentDir = path.dirname(destDir);
  fs.mkdirSync(parentDir, { recursive: true });

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
    // Interactive: create-expo-app can show its own prompt (e.g. picking an SDK
    // version) — inherit stdio so it's visible and answerable. No timeout here
    // on purpose: a human may genuinely need time to read and respond to it.
    { interactive: true },
  );

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
