import { execa } from 'execa';

/**
 * Re.Pack releases the superapp flow can scaffold with, newest first, and the
 * newest react-native minor each one can bundle.
 *
 * Re.Pack's own peerDependencies only give a floor (`react-native >=0.74`), so
 * the ceiling here comes from reading its NativeEntryPlugin source:
 * - <= 5.3.x `require()`s the root `rn-get-polyfills.js` directly, which RN
 *   0.87 removed — so those releases top out at 0.86.
 * - 5.4.0 falls back to resolving `@react-native/js-polyfills` via
 *   `@react-native/metro-config` when that file is missing, adding 0.87.
 *
 * Nothing older than 5.3.0 is listed: the templates were bumped to a 5.3.0
 * floor (b9f2991), and older releases haven't been verified against the
 * Rspack 2 / Module Federation 2.9 setup the overlays use.
 *
 * When a new Re.Pack ships, add a row here after checking which RN it handles.
 */
export interface RepackRelease {
  version: string;
  /** Newest react-native minor line this release supports, e.g. '0.87'. */
  reactNativeLine: string;
  /** Used when the npm registry can't be reached to find the newest patch. */
  fallbackReactNativeVersion: string;
}

export const REPACK_RELEASES: RepackRelease[] = [
  { version: '5.4.0', reactNativeLine: '0.87', fallbackReactNativeVersion: '0.87.1' },
  { version: '5.3.0', reactNativeLine: '0.86', fallbackReactNativeVersion: '0.86.3' },
];

/** Newest published stable patch in a react-native minor line (e.g. '0.86' -> '0.86.3'). */
export async function resolveNewestReactNative(release: RepackRelease): Promise<string> {
  try {
    // `~0.86.0` matches 0.86.x stable releases only — npm excludes prereleases
    // from ranges unless the range itself names one.
    const { stdout } = await execa(
      'npm',
      ['view', `react-native@~${release.reactNativeLine}.0`, 'version', '--json'],
      { timeout: 15_000 },
    );
    // npm prints a bare string for a single match and an ascending array otherwise.
    const parsed: unknown = JSON.parse(stdout);
    const versions = Array.isArray(parsed) ? parsed : [parsed];
    const newest = versions.at(-1);
    return typeof newest === 'string' && newest ? newest : release.fallbackReactNativeVersion;
  } catch {
    return release.fallbackReactNativeVersion;
  }
}
