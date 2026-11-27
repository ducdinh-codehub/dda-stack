import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { execa } from 'execa';
import { spinner } from './theme.js';

const HELP = `Usage: create-dda-stack check [app-dir]

Looks through an Expo or React Native app for common reasons Apple or Google
reject a submission, and says how to fix each one. It only reads files.

Run it before \`eas submit\`, an App Store upload or a Play Store release.
Exits with 1 if anything high-risk is found, so it can gate a CI step.

Options:
  -h, --help             Show this help

Example:
  npx create-dda-stack@latest check ./my-app`;

/**
 * Google Play's minimum target API level for new apps and updates. Google
 * raises it every August — check
 * https://developer.android.com/google/play/requirements/target-sdk
 */
const MIN_TARGET_SDK = 35;

type Severity = 'high' | 'medium';

interface Finding {
  severity: Severity;
  /** The store guideline it maps to, e.g. "Apple 5.1.1". */
  rule: string;
  message: string;
  fix: string;
  file?: string;
}

/** What a check needs to know about the app, read once from its files. */
interface AppInfo {
  dir: string;
  isExpo: boolean;
  deps: Set<string>;
  /** Info.plist keys -> string values, from the Expo config and/or ios/*\/Info.plist. */
  plist: Map<string, string>;
  /** Raw Info.plist text, for keys that aren't strings. */
  plistXml: string;
  /** Expo `plugins` entries, keyed by package name -> their options (or {}). */
  plugins: Map<string, Record<string, unknown>>;
  expo?: Record<string, any>;
  /** There's an app.config.* that couldn't be evaluated, so only app.json was read. */
  dynamicFailed: boolean;
  androidPermissions: Set<string>;
  manifestXml: string;
  targetSdk?: number;
  iosBundleId?: string;
  androidPackage?: string;
  /** Path relative to dir -> contents, for app source and .env files. */
  sources: Map<string, string>;
}

/**
 * Each native module that asks for a permission, the Info.plist key iOS
 * needs for it, and the Expo plugin options that set that key.
 */
const PERMISSION_MODULES: Array<{ packages: string[]; plistKeys: string[]; pluginOptions: string[]; what: string }> = [
  {
    packages: ['expo-camera', 'react-native-vision-camera'],
    plistKeys: ['NSCameraUsageDescription'],
    pluginOptions: ['cameraPermission', 'cameraPermissionText'],
    what: 'the camera',
  },
  {
    packages: ['expo-image-picker', 'react-native-image-picker', 'expo-media-library', '@react-native-camera-roll/camera-roll'],
    plistKeys: ['NSPhotoLibraryUsageDescription'],
    pluginOptions: ['photosPermission'],
    what: 'the photo library',
  },
  {
    packages: ['expo-location', '@react-native-community/geolocation', 'react-native-geolocation-service'],
    plistKeys: ['NSLocationWhenInUseUsageDescription', 'NSLocationAlwaysAndWhenInUseUsageDescription'],
    pluginOptions: ['locationWhenInUsePermission', 'locationAlwaysAndWhenInUsePermission'],
    what: 'location',
  },
  {
    packages: ['expo-contacts', 'react-native-contacts'],
    plistKeys: ['NSContactsUsageDescription'],
    pluginOptions: ['contactsPermission'],
    what: 'contacts',
  },
  {
    packages: ['expo-calendar'],
    plistKeys: ['NSCalendarsUsageDescription', 'NSCalendarsFullAccessUsageDescription'],
    pluginOptions: ['calendarPermission'],
    what: 'the calendar',
  },
  {
    packages: ['expo-audio', 'expo-av', 'react-native-audio-recorder-player'],
    plistKeys: ['NSMicrophoneUsageDescription'],
    pluginOptions: ['microphonePermission'],
    what: 'the microphone',
  },
  {
    packages: ['expo-local-authentication', 'react-native-biometrics'],
    plistKeys: ['NSFaceIDUsageDescription'],
    pluginOptions: ['faceIDPermission'],
    what: 'Face ID',
  },
  {
    packages: ['expo-tracking-transparency', 'react-native-tracking-transparency'],
    plistKeys: ['NSUserTrackingUsageDescription'],
    pluginOptions: ['userTrackingPermission'],
    what: 'tracking (App Tracking Transparency)',
  },
];

/** Android permissions Play only allows with an approved declaration form. */
const RESTRICTED_ANDROID_PERMISSIONS = [
  'READ_SMS',
  'RECEIVE_SMS',
  'SEND_SMS',
  'READ_CALL_LOG',
  'WRITE_CALL_LOG',
  'PROCESS_OUTGOING_CALLS',
  'MANAGE_EXTERNAL_STORAGE',
  'QUERY_ALL_PACKAGES',
  'ACCESS_BACKGROUND_LOCATION',
  'REQUEST_INSTALL_PACKAGES',
  'READ_MEDIA_IMAGES',
  'READ_MEDIA_VIDEO',
];

const THIRD_PARTY_LOGINS = [
  '@react-native-google-signin/google-signin',
  'react-native-fbsdk-next',
  '@react-native-firebase/auth',
];
const APPLE_LOGINS = ['expo-apple-authentication', '@invertase/react-native-apple-authentication'];

const PLACEHOLDER_ID = /^(com\.anonymous|com\.example|org\.reactjs\.native\.example|com\.yourcompany)\./;
const DEV_URL = /\bhttps?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d+\.\d+)\b/;
const INSECURE_URL = /\bhttp:\/\/(?!localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.)[\w.-]+/;
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const SKIP_DIRS = new Set(['node_modules', 'ios', 'android', '.expo', '.git', 'dist', 'build', '__tests__']);

function readIfExists(file: string): string {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

/** ios/<App>/Info.plist — not the ones inside Pods or test targets. */
function findInfoPlists(dir: string): string[] {
  const iosDir = path.join(dir, 'ios');
  if (!fs.existsSync(iosDir)) return [];
  return fs
    .readdirSync(iosDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== 'Pods' && !entry.name.endsWith('Tests'))
    .map(entry => path.join(iosDir, entry.name, 'Info.plist'))
    .filter(file => fs.existsSync(file));
}

function plistStrings(xml: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const match of xml.matchAll(/<key>([^<]+)<\/key>\s*<string>([^<]*)<\/string>/g)) {
    values.set(match[1], match[2]);
  }
  return values;
}

/** app.json is read directly; a dynamic app.config.* needs Expo's own CLI to evaluate. */
async function readExpoConfig(dir: string): Promise<{ config?: Record<string, any>; dynamicFailed: boolean }> {
  const hasDynamicConfig = ['app.config.js', 'app.config.ts', 'app.config.mjs', 'app.config.cjs'].some(name =>
    fs.existsSync(path.join(dir, name)),
  );
  if (hasDynamicConfig) {
    try {
      const { stdout } = await execa('npx', ['expo', 'config', '--json'], { cwd: dir });
      return { config: JSON.parse(stdout), dynamicFailed: false };
    } catch {
      // Falls through to app.json; checkApp reports that the dynamic config wasn't read.
    }
  }
  const appJson = readIfExists(path.join(dir, 'app.json'));
  const parsed = appJson ? JSON.parse(appJson) : undefined;
  return { config: parsed?.expo ?? parsed, dynamicFailed: hasDynamicConfig };
}

function readSources(dir: string): Map<string, string> {
  const sources = new Map<string, string>();
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) walk(full);
      } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name)) && !/\.(test|spec)\.[jt]sx?$/.test(entry.name)) {
        sources.set(path.relative(dir, full), fs.readFileSync(full, 'utf8'));
      }
    }
  };
  for (const sub of ['src', 'app']) {
    if (fs.existsSync(path.join(dir, sub))) walk(path.join(dir, sub));
  }
  for (const file of ['App.tsx', 'App.js', '.env', '.env.production']) {
    const contents = readIfExists(path.join(dir, file));
    if (contents) sources.set(file, contents);
  }
  return sources;
}

async function readApp(dir: string): Promise<AppInfo> {
  const pkg = JSON.parse(readIfExists(path.join(dir, 'package.json')) || '{}');
  const deps = new Set(Object.keys({ ...pkg.dependencies }));
  const isExpo = deps.has('expo');
  const { config: expo, dynamicFailed } = isExpo ? await readExpoConfig(dir) : { dynamicFailed: false };

  const plistXml = findInfoPlists(dir).map(readIfExists).join('\n');
  const plist = plistStrings(plistXml);
  for (const [key, value] of Object.entries(expo?.ios?.infoPlist ?? {})) {
    if (typeof value === 'string') plist.set(key, value);
  }

  const plugins = new Map<string, Record<string, unknown>>();
  for (const entry of expo?.plugins ?? []) {
    const [name, options] = Array.isArray(entry) ? entry : [entry, {}];
    if (typeof name === 'string') plugins.set(name, options ?? {});
  }

  const manifestXml = readIfExists(path.join(dir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'));
  const androidPermissions = new Set<string>();
  for (const match of manifestXml.matchAll(/android:name="android\.permission\.([A-Z_]+)"/g)) {
    androidPermissions.add(match[1]);
  }
  for (const permission of expo?.android?.permissions ?? []) {
    androidPermissions.add(String(permission).replace(/^android\.permission\./, ''));
  }

  const buildProps = (plugins.get('expo-build-properties') as any)?.android;
  const gradle =
    readIfExists(path.join(dir, 'android', 'build.gradle')) + readIfExists(path.join(dir, 'android', 'app', 'build.gradle'));
  const gradleTarget = gradle.match(/targetSdkVersion\s*=?\s*(\d+)/)?.[1];
  const targetSdk = buildProps?.targetSdkVersion ?? (gradleTarget ? Number(gradleTarget) : undefined);

  const pbxproj = fs.existsSync(path.join(dir, 'ios'))
    ? fs
        .readdirSync(path.join(dir, 'ios'))
        .filter(name => name.endsWith('.xcodeproj'))
        .map(name => readIfExists(path.join(dir, 'ios', name, 'project.pbxproj')))
        .join('\n')
    : '';

  return {
    dir,
    isExpo,
    deps,
    plist,
    plistXml,
    plugins,
    expo,
    dynamicFailed,
    androidPermissions,
    manifestXml,
    targetSdk,
    iosBundleId: expo?.ios?.bundleIdentifier ?? pbxproj.match(/PRODUCT_BUNDLE_IDENTIFIER = "?([^";]+)"?;/)?.[1],
    androidPackage: expo?.android?.package ?? gradle.match(/applicationId\s+"([^"]+)"/)?.[1],
    sources: readSources(dir),
  };
}

function checkPurposeStrings(app: AppInfo): Finding[] {
  const findings: Finding[] = [];
  for (const module of PERMISSION_MODULES) {
    const used = module.packages.filter(name => app.deps.has(name));
    if (used.length === 0) continue;
    const text =
      module.plistKeys.map(key => app.plist.get(key)).find(Boolean) ??
      used
        .map(name => app.plugins.get(name))
        .flatMap(options => module.pluginOptions.map(option => options?.[option]))
        .find((value): value is string => typeof value === 'string');
    if (!text) {
      findings.push({
        severity: 'high',
        rule: 'Apple 5.1.1',
        message: `${used.join(', ')} uses ${module.what}, but there's no purpose string for it.`,
        fix: app.isExpo
          ? `Set ios.infoPlist.${module.plistKeys[0]} in app.json (or the ${used[0]} plugin's permission option) to say why the app needs ${module.what}.`
          : `Add ${module.plistKeys[0]} to Info.plist saying why the app needs ${module.what}.`,
      });
    } else if (text.length < 25 || /^Allow \$\(PRODUCT_NAME\) to access/.test(text)) {
      findings.push({
        severity: 'medium',
        rule: 'Apple 5.1.1',
        message: `The purpose string for ${module.what} is generic: "${text}".`,
        fix: 'Say what feature uses it, e.g. "Scan receipts to add them to your expenses." Generic text is a common rejection.',
      });
    }
  }
  return findings;
}

function checkPrivacyManifest(app: AppInfo): Finding[] {
  // Expo writes PrivacyInfo.xcprivacy during prebuild, so only check a committed ios/ folder.
  const appDirs = findInfoPlists(app.dir).map(path.dirname);
  if (appDirs.length === 0 || app.expo?.ios?.privacyManifests) return [];
  if (appDirs.some(dir => fs.existsSync(path.join(dir, 'PrivacyInfo.xcprivacy')))) return [];
  return [
    {
      severity: 'high',
      rule: 'Apple privacy manifest',
      message: 'No PrivacyInfo.xcprivacy in the iOS app target.',
      fix: 'Add a privacy manifest declaring the required-reason APIs the app uses (React Native itself uses some).',
      file: path.relative(app.dir, appDirs[0]),
    },
  ];
}

function checkAccounts(app: AppInfo): Finding[] {
  const findings: Finding[] = [];
  const code = [...app.sources].filter(([file]) => !file.startsWith('.env'));
  const signUpFile = code.find(([, text]) => /\b(signUp|createAccount|createUserWithEmailAndPassword|registerUser)\b/.test(text));
  if (signUpFile && !code.some(([, text]) => /delete\s*_?account|deleteUser|deleteAccount|removeAccount/i.test(text))) {
    findings.push({
      severity: 'high',
      rule: 'Apple 5.1.1(v)',
      message: 'The app lets people create an account, but there seems to be no way to delete it.',
      fix: 'Add an in-app "Delete account" option that deletes the account, not just signs out.',
      file: signUpFile[0],
    });
  }
  const others = THIRD_PARTY_LOGINS.filter(name => app.deps.has(name));
  if (others.length > 0 && !APPLE_LOGINS.some(name => app.deps.has(name))) {
    findings.push({
      severity: 'medium',
      rule: 'Apple 4.8',
      message: `The app uses a third-party login (${others.join(', ')}) without Sign in with Apple.`,
      fix: 'Apple requires an equivalent privacy-focused login option. Adding Sign in with Apple (expo-apple-authentication) is the usual fix.',
    });
  }
  return findings;
}

function checkIosNetwork(app: AppInfo): Finding[] {
  const fromConfig = app.expo?.ios?.infoPlist?.NSAppTransportSecurity?.NSAllowsArbitraryLoads === true;
  if (!fromConfig && !/<key>NSAllowsArbitraryLoads<\/key>\s*<true\/>/.test(app.plistXml)) return [];
  return [
    {
      severity: 'medium',
      rule: 'Apple App Transport Security',
      message: 'NSAllowsArbitraryLoads is on, which allows plain HTTP to any server.',
      fix: 'Turn it off and use HTTPS, or allow only the domains that need it with NSExceptionDomains. Apple asks you to justify it.',
    },
  ];
}

function checkAndroid(app: AppInfo): Finding[] {
  const findings: Finding[] = [];
  if (app.targetSdk !== undefined && app.targetSdk < MIN_TARGET_SDK) {
    findings.push({
      severity: 'high',
      rule: 'Google Play target API',
      message: `targetSdkVersion is ${app.targetSdk}. Play requires ${MIN_TARGET_SDK} or higher.`,
      fix: app.isExpo
        ? `Upgrade the Expo SDK, or set android.targetSdkVersion in the expo-build-properties plugin.`
        : `Set targetSdkVersion = ${MIN_TARGET_SDK} in android/build.gradle.`,
    });
  }
  const restricted = RESTRICTED_ANDROID_PERMISSIONS.filter(name => app.androidPermissions.has(name));
  if (restricted.length > 0) {
    findings.push({
      severity: 'high',
      rule: 'Google Play permissions policy',
      message: `The app asks for restricted permissions: ${restricted.join(', ')}.`,
      fix: 'Remove them if they are not core to the app. Otherwise fill in the Permissions Declaration in Play Console before the review.',
    });
  }
  const buildProps = (app.plugins.get('expo-build-properties') as any)?.android;
  if (buildProps?.usesCleartextTraffic === true || /android:usesCleartextTraffic="true"/.test(app.manifestXml)) {
    findings.push({
      severity: 'medium',
      rule: 'Android cleartext traffic',
      message: 'Release builds allow plain HTTP traffic.',
      fix: 'Use HTTPS, or allow HTTP only in the debug manifest or for specific domains with a network security config.',
    });
  }
  return findings;
}

function checkIdentifiers(app: AppInfo): Finding[] {
  const findings: Finding[] = [];
  for (const [label, id] of [
    ['iOS bundle identifier', app.iosBundleId],
    ['Android package name', app.androidPackage],
  ] as const) {
    if (id && PLACEHOLDER_ID.test(id)) {
      findings.push({
        severity: 'high',
        rule: 'Store metadata',
        message: `The ${label} is still a placeholder: ${id}.`,
        fix: 'Change it to a reverse-domain ID you own, e.g. com.yourname.myapp. It cannot be changed after the first release.',
      });
    }
  }
  return findings;
}

function checkUrls(app: AppInfo): Finding[] {
  const findings: Finding[] = [];
  for (const [file, text] of app.sources) {
    const lines = text.split('\n');
    const lineOf = (pattern: RegExp) => lines.findIndex(line => pattern.test(line) && !/^\s*(\/\/|\*|#)/.test(line));
    const dev = lineOf(DEV_URL);
    if (dev >= 0) {
      findings.push({
        severity: 'high',
        rule: 'Apple 2.1 / app completeness',
        message: 'A local development URL would ship in the release build.',
        fix: 'Point it at your production server, or read it from an env variable that differs per build.',
        file: `${file}:${dev + 1}`,
      });
    }
    const insecure = lineOf(INSECURE_URL);
    if (insecure >= 0) {
      findings.push({
        severity: 'medium',
        rule: 'Secure networking',
        message: 'A plain http:// URL is used. iOS blocks it by default and it sends data unencrypted.',
        fix: 'Use https://.',
        file: `${file}:${insecure + 1}`,
      });
    }
    if (file.startsWith('.env') && /example\.com/.test(text)) {
      findings.push({
        severity: 'medium',
        rule: 'Apple 2.1 / app completeness',
        message: 'The API URL is still the example.com placeholder.',
        fix: 'Set it to your real API. A reviewer who hits a dead backend rejects the app as broken.',
        file,
      });
    }
  }
  return findings;
}

export async function checkApp(dir: string): Promise<Finding[]> {
  const app = await readApp(dir);
  const unread: Finding[] = app.dynamicFailed
    ? [
        {
          severity: 'medium',
          rule: 'Scan coverage',
          message: "Couldn't evaluate app.config.*, so only app.json was checked.",
          fix: 'Install dependencies and run the scan again.',
        },
      ]
    : [];
  return [
    ...unread,
    ...checkIdentifiers(app),
    ...checkPurposeStrings(app),
    ...checkPrivacyManifest(app),
    ...checkAccounts(app),
    ...checkIosNetwork(app),
    ...checkAndroid(app),
    ...checkUrls(app),
  ].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1));
}

/** Scans one app with a spinner, then prints what it found. Returns how many findings were high. */
export async function scanApp(dir: string, label: string): Promise<number> {
  const s = spinner();
  s.start(`Scanning ${label} for store rejection risks`);
  const findings = await checkApp(dir);
  const high = findings.filter(finding => finding.severity === 'high').length;
  s.stop(
    findings.length === 0
      ? `${label}: no known rejection risks found`
      : `${label}: ${high} high, ${findings.length - high} medium`,
  );
  for (const finding of findings) {
    const tag = finding.severity === 'high' ? pc.red('HIGH') : pc.yellow('MEDIUM');
    const lines = [
      `${tag} ${pc.dim(finding.rule)}  ${finding.message}`,
      finding.file ? pc.dim(`file: ${finding.file}`) : undefined,
      `${pc.green('fix:')} ${finding.fix}`,
    ].filter(Boolean);
    (finding.severity === 'high' ? p.log.error : p.log.warn)(lines.join('\n'));
  }
  return high;
}

export async function runCheck(argv: string[]) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true, strict: true, options: { help: { type: 'boolean', short: 'h' } } });
  } catch (err) {
    console.error(`${(err as Error).message}\n\n${HELP}`);
    process.exit(1);
  }
  if (parsed.values.help) {
    console.log(HELP);
    process.exit(0);
  }
  if (parsed.positionals.length > 1) {
    console.error(`Expected at most one app folder, got: ${parsed.positionals.join(' ')}`);
    process.exit(1);
  }

  const dir = path.resolve(parsed.positionals[0] ?? '.');
  if (!fs.existsSync(path.join(dir, 'package.json'))) {
    console.error(`"${dir}" isn't an app folder (no package.json).`);
    process.exit(1);
  }

  p.intro('Store compliance scan');
  const high = await scanApp(dir, path.basename(dir));
  p.outro(
    high > 0
      ? 'Fix the high ones before submitting.'
      : 'This covers common rejection causes only, not a full review.',
  );
  if (high > 0) process.exitCode = 1;
}
