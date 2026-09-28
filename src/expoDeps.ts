import fs from 'node:fs';
import path from 'node:path';

/**
 * @react-navigation/bottom-tabs 7.16+ drives its native tabs through
 * react-native-screens' `Tabs.Host navStateRequest`, added in screens 4.25.
 * Paired with an older screens (e.g. SDK 55's ~4.23), no tab is ever marked
 * focused and iOS aborts at launch in `-[RNSTabBarController
 * assertExactlyOneFocusedTab]`. 7.15 still sets `isFocused` per tab screen.
 */
const FIRST_SCREENS_WITH_NAV_STATE = { major: 4, minor: 25 };
const BOTTOM_TABS_FOR_OLD_SCREENS = '~7.15.0';

function screensPredatesNavState(range: string): boolean {
  const match = /(\d+)\.(\d+)/.exec(range);
  if (!match) return false;
  const [major, minor] = [Number(match[1]), Number(match[2])];
  return (
    major < FIRST_SCREENS_WITH_NAV_STATE.major ||
    (major === FIRST_SCREENS_WITH_NAV_STATE.major && minor < FIRST_SCREENS_WITH_NAV_STATE.minor)
  );
}

/**
 * Our templates pin native deps with loose ranges (e.g. react-native-screens
 * `^4.25.0`) that can resolve past what an Expo SDK's react-native supports —
 * screens 4.28 on SDK 55 / RN 0.83 fails codegen during `pod install`. Each
 * SDK publishes the exact versions it was tested with in expo's
 * `bundledNativeModules.json` (what `expo install` uses), so pin to those.
 */
export async function alignWithExpoSdk(
  destDir: string,
  sdk: number,
): Promise<{ aligned: string[] } | undefined> {
  let bundled: Record<string, string>;
  try {
    const res = await fetch(`https://cdn.jsdelivr.net/npm/expo@sdk-${sdk}/bundledNativeModules.json`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return undefined;
    bundled = (await res.json()) as Record<string, string>;
  } catch {
    return undefined;
  }

  const pkgPath = path.join(destDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const aligned: string[] = [];
  for (const field of ['dependencies', 'devDependencies'] as const) {
    const deps: Record<string, string> | undefined = pkg[field];
    if (!deps) continue;
    for (const name of Object.keys(deps)) {
      const version = bundled[name];
      if (version && deps[name] !== version) {
        deps[name] = version;
        aligned.push(name);
      }
    }
  }

  const deps = pkg.dependencies ?? {};
  if (
    deps['@react-navigation/bottom-tabs'] &&
    deps['react-native-screens'] &&
    screensPredatesNavState(deps['react-native-screens'])
  ) {
    deps['@react-navigation/bottom-tabs'] = BOTTOM_TABS_FOR_OLD_SCREENS;
    aligned.push('@react-navigation/bottom-tabs');
  }

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  return { aligned };
}
