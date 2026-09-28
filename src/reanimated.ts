import fs from 'node:fs';
import path from 'node:path';

/**
 * react-native-reanimated 4 lines, newest first, with the react-native minors
 * each supports and the react-native-worklets line it must be paired with —
 * copied from reanimated's own `compatibility.json` (fabric section). Reanimated's
 * podspec aborts `pod install` ("Failed to validate worklets version") if the
 * installed worklets doesn't match, so the two are always pinned as a pair.
 *
 * NativeWind is the only thing that installs reanimated: react-native-css-interop's
 * Babel preset always loads `react-native-worklets/plugin`, so it needs
 * reanimated 4+ — hence no 3.x rows, and the RN 0.78 floor below.
 *
 * When a new reanimated ships, add its row from that file.
 */
interface ReanimatedRelease {
  reanimated: string;
  worklets: string;
  reactNativeMinors: number[];
}

const REANIMATED_RELEASES: ReanimatedRelease[] = [
  { reanimated: '~4.7.0', worklets: '0.13.x', reactNativeMinors: [86, 87, 88] },
  { reanimated: '~4.6.0', worklets: '0.12.x', reactNativeMinors: [83, 84, 85, 86, 87] },
  { reanimated: '~4.5.0', worklets: '0.11.x', reactNativeMinors: [83, 84, 85, 86] },
  { reanimated: '~4.4.0', worklets: '0.10.x', reactNativeMinors: [83, 84, 85, 86] },
  { reanimated: '~4.3.0', worklets: '0.8.x', reactNativeMinors: [81, 82, 83, 84, 85] },
  { reanimated: '~4.2.0', worklets: '0.8.x', reactNativeMinors: [80, 81, 82, 83, 84] },
  { reanimated: '~4.1.0', worklets: '0.8.x', reactNativeMinors: [78, 79, 80, 81, 82] },
];

/** Oldest react-native minor NativeWind can be installed on (reanimated 4.1's floor). */
export const MIN_NATIVEWIND_REACT_NATIVE_MINOR = 78;

export function reactNativeMinor(version: string): number | undefined {
  const match = /^[~^]?0\.(\d+)\./.exec(version.trim());
  return match ? Number(match[1]) : undefined;
}

/**
 * Adds the newest reanimated + worklets pair that supports the project's
 * react-native version to its package.json. Returns what was added, and
 * whether it had to fall back to the newest pair because the RN version
 * isn't in the table (e.g. an RN release newer than the table).
 */
export function addReanimatedForReactNative(destDir: string): {
  reactNative: string;
  reanimated: string;
  worklets: string;
  fellBack: boolean;
} {
  const pkgPath = path.join(destDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const reactNative: string = pkg.dependencies?.['react-native'] ?? '';
  const minor = reactNativeMinor(reactNative);

  const match = REANIMATED_RELEASES.find(
    release => minor !== undefined && release.reactNativeMinors.includes(minor),
  );
  const release = match ?? REANIMATED_RELEASES[0];

  pkg.dependencies = {
    ...pkg.dependencies,
    'react-native-reanimated': release.reanimated,
    'react-native-worklets': release.worklets,
  };
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  return { reactNative, reanimated: release.reanimated, worklets: release.worklets, fellBack: !match };
}
