import fs from 'node:fs';
import path from 'node:path';

/**
 * Finishes switching an Expo project from React Navigation to Expo Router.
 * Runs after every overlay: the expo-router overlay adds app/, but the common,
 * reactotron and nativewind overlays still write the React Navigation entry
 * (index.ts -> App.tsx -> RootNavigator), which Expo Router replaces with
 * `expo-router/entry` + app/_layout.tsx.
 */
export function finishExpoRouterSetup(
  destDir: string,
  opts: { projectSlug: string; useReactotron: boolean; useNativewind: boolean },
) {
  for (const entry of ['App.tsx', 'index.ts', path.join('src', 'navigation')]) {
    fs.rmSync(path.join(destDir, entry), { recursive: true, force: true });
  }

  // What App.tsx (reactotron) and index.ts (nativewind) imported first thing
  // has to move to the root layout, which is now the first app code to run.
  const layoutPath = path.join(destDir, 'app', '_layout.tsx');
  const firstImports = [
    opts.useNativewind ? "import '../global.css';" : undefined,
    opts.useReactotron ? "import '../src/config/ReactotronConfig';" : undefined,
  ].filter(Boolean);
  if (firstImports.length > 0) {
    fs.writeFileSync(layoutPath, firstImports.join('\n') + '\n' + fs.readFileSync(layoutPath, 'utf8'));
  }

  // Expo Router ships its own React Navigation (a dependency up to SDK 54,
  // vendored from SDK 55) — direct @react-navigation/* deps would only risk a
  // second copy with its own navigation context.
  const pkgPath = path.join(destDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    if (name.startsWith('@react-navigation/')) delete pkg.dependencies[name];
  }
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  // The config plugin wires up native deep linking; the scheme is the URL
  // prefix links open the app with (myapp://explore).
  const appJsonPath = path.join(destDir, 'app.json');
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  appJson.expo.scheme ??= opts.projectSlug;
  const plugins: unknown[] = appJson.expo.plugins ?? [];
  if (!plugins.includes('expo-router')) plugins.push('expo-router');
  appJson.expo.plugins = plugins;
  fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');
}
