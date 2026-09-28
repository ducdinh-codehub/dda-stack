import { execa } from 'execa';

/**
 * Oldest react-native minor the bare RN CLI flow can scaffold: `init --version`
 * pulls `@react-native-community/template@<version>`, whose first stable
 * release is 0.75.1.
 */
export const MIN_REACT_NATIVE_MINOR = 75;

/** Used when the npm registry can't be reached — newest patch of recent minors. */
const FALLBACK_VERSIONS = ['0.87.1', '0.86.3', '0.85.3', '0.84.1', '0.83.10'];

const STABLE_VERSION = /^0\.(\d+)\.(\d+)$/;

/**
 * Newest stable patch of each of the `count` most recent react-native minors,
 * newest first (e.g. ['0.87.1', '0.86.3', ...]). Prereleases are skipped.
 */
export async function listRecentReactNativeVersions(count = 5): Promise<string[]> {
  try {
    const { stdout } = await execa('npm', ['view', 'react-native', 'versions', '--json'], {
      timeout: 15_000,
    });
    const versions: unknown = JSON.parse(stdout);
    if (!Array.isArray(versions)) return FALLBACK_VERSIONS;

    const newestPatchByMinor = new Map<number, { patch: number; version: string }>();
    for (const version of versions) {
      const match = typeof version === 'string' ? STABLE_VERSION.exec(version) : null;
      if (!match) continue;
      const minor = Number(match[1]);
      const patch = Number(match[2]);
      if (minor < MIN_REACT_NATIVE_MINOR) continue;
      const current = newestPatchByMinor.get(minor);
      if (!current || patch > current.patch) newestPatchByMinor.set(minor, { patch, version });
    }

    const recent = [...newestPatchByMinor.entries()]
      .sort(([a], [b]) => b - a)
      .slice(0, count)
      .map(([, { version }]) => version);
    return recent.length > 0 ? recent : FALLBACK_VERSIONS;
  } catch {
    return FALLBACK_VERSIONS;
  }
}

/**
 * Whether `version` is a published react-native release. Returns true when the
 * registry can't be reached, so an offline check never blocks a valid version —
 * the generator itself will fail clearly if it really doesn't exist.
 */
export async function reactNativeVersionExists(version: string): Promise<boolean> {
  try {
    const { stdout } = await execa('npm', ['view', `react-native@${version}`, 'version', '--json'], {
      timeout: 15_000,
    });
    return stdout.trim().length > 0;
  } catch (error) {
    // npm exits non-zero with E404 for a version that doesn't exist.
    const output = String((error as { stderr?: string }).stderr ?? '');
    return !output.includes('E404');
  }
}
