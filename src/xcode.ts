import { execa } from 'execa';

/**
 * Expo SDK 56+ ships `expo-modules-jsi`, whose Swift sources use `weak let`
 * (e.g. `private weak let runtime` in JavaScriptActor.swift). Swift 6.2 —
 * what Xcode 26.0.x ships — rejects that ("'weak' must be a mutable variable"),
 * so `expo run:ios` dies with xcodebuild exit code 65. Expo CLI's own Xcode
 * check only asks for 14.1, so nothing warns about it before the build.
 */
const FIRST_EXPO_SDK_NEEDING_NEW_SWIFT = 56;
const LAST_UNSUPPORTED_SWIFT = { major: 6, minor: 2 };

export interface XcodeToolchain {
  xcodeVersion: string;
  swiftMajor: number;
  swiftMinor: number;
}

/**
 * This Mac's active Xcode and Swift versions. Undefined when not on macOS or
 * when Xcode isn't installed (the user may only target Android) — callers
 * then skip the check rather than guess.
 */
export async function getXcodeToolchain(): Promise<XcodeToolchain | undefined> {
  if (process.platform !== 'darwin') return undefined;
  try {
    const [{ stdout: swiftOut }, { stdout: xcodeOut }] = await Promise.all([
      execa('xcrun', ['swift', '--version'], { timeout: 15_000 }),
      execa('xcodebuild', ['-version'], { timeout: 15_000 }),
    ]);
    const swift = /Apple Swift version (\d+)\.(\d+)/.exec(swiftOut);
    if (!swift) return undefined;
    return {
      xcodeVersion: /Xcode (\S+)/.exec(xcodeOut)?.[1] ?? 'unknown',
      swiftMajor: Number(swift[1]),
      swiftMinor: Number(swift[2]),
    };
  } catch {
    return undefined;
  }
}

/** Whether `toolchain` is known to be too old to compile Expo `sdk` for iOS. */
export function isXcodeTooOldForExpoSdk(sdk: number, toolchain: XcodeToolchain | undefined): boolean {
  if (!toolchain || sdk < FIRST_EXPO_SDK_NEEDING_NEW_SWIFT) return false;
  const { swiftMajor, swiftMinor } = toolchain;
  return (
    swiftMajor < LAST_UNSUPPORTED_SWIFT.major ||
    (swiftMajor === LAST_UNSUPPORTED_SWIFT.major && swiftMinor <= LAST_UNSUPPORTED_SWIFT.minor)
  );
}
