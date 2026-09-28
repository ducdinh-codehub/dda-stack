import { execa } from 'execa';

/**
 * Oldest Expo SDK offered. From SDK 54 on, Expo's own packages (e.g.
 * babel-preset-expo) are versioned to match the SDK number, which the expo
 * overlay relies on (`~{{expoSdk}}.0.0`).
 */
const MIN_EXPO_SDK = 54;

export interface ExpoSdk {
  sdk: number;
  /** react-native version the SDK's blank template ships, if known. */
  reactNative?: string;
}

/** Used when the npm registry can't be reached. */
const FALLBACK_SDKS: ExpoSdk[] = [
  { sdk: 57, reactNative: '0.86.3' },
  { sdk: 56, reactNative: '0.85.3' },
  { sdk: 55, reactNative: '0.83.10' },
  { sdk: 54, reactNative: '0.81.5' },
];

/**
 * The `count` newest stable Expo SDKs, newest first — read from expo's
 * `sdk-NN` dist-tags, which only exist for released SDKs (previews live under
 * `next`/`canary`).
 */
export async function listRecentExpoSdks(count = 4): Promise<ExpoSdk[]> {
  try {
    const { stdout } = await execa('npm', ['view', 'expo', 'dist-tags', '--json'], { timeout: 15_000 });
    const tags: Record<string, string> = JSON.parse(stdout);
    const sdks = Object.keys(tags)
      .map(tag => /^sdk-(\d+)$/.exec(tag)?.[1])
      .filter((sdk): sdk is string => sdk !== undefined)
      .map(Number)
      .filter(sdk => sdk >= MIN_EXPO_SDK)
      .sort((a, b) => b - a)
      .slice(0, count);
    if (sdks.length === 0) return FALLBACK_SDKS;

    return await Promise.all(
      sdks.map(async sdk => ({ sdk, reactNative: await templateReactNative(sdk) })),
    );
  } catch {
    return FALLBACK_SDKS;
  }
}

async function templateReactNative(sdk: number): Promise<string | undefined> {
  try {
    const { stdout } = await execa(
      'npm',
      ['view', `expo-template-blank-typescript@sdk-${sdk}`, 'dependencies.react-native'],
      { timeout: 15_000 },
    );
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}
