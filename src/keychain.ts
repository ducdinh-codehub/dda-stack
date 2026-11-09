import fs from 'node:fs';
import path from 'node:path';
import { overlayTemplate, TEMPLATES_ROOT, type TemplateVars } from './scaffold.js';
import { reactNativeMinor } from './reanimated.js';

/** Used when keys are left for later, and with --yes when no --keychain-keys is passed. */
export const DEFAULT_KEYCHAIN_KEYS = ['auth_token', 'refresh_token'];

/** The key the template API client reads its bearer token from — see templates/common/src/api/client.ts. */
const AUTH_TOKEN_KEY = 'auth_token';

// Each key becomes a keychain service name and a TS string literal, so keep it plain.
const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]*$/;

/** Why `key` can't be added after `previous`, or undefined if it can. */
export function keychainKeyProblem(key: string, previous: string[]): string | undefined {
  if (!key) return 'Enter a key name, e.g. auth_token';
  if (!KEY_PATTERN.test(key)) return `"${key}" must start with a letter and use only letters, digits, _ . -`;
  if (previous.includes(key)) return `"${key}" is already added`;
  const clash = previous.find(other => envName(other) === envName(key));
  if (clash) return `"${key}" clashes with "${clash}" — both would be ${envName(key)} in .env`;
  return undefined;
}

/** Splits "a, b,c" into keys, or returns why the list can't be used. */
export function parseKeychainKeys(value: string | undefined): { keys: string[] } | { error: string } {
  const keys = (value ?? '')
    .split(',')
    .map(key => key.trim())
    .filter(Boolean);
  if (keys.length === 0) return { error: 'Enter at least one key, e.g. auth_token' };
  for (const [index, key] of keys.entries()) {
    const problem = keychainKeyProblem(key, keys.slice(0, index));
    if (problem) return { error: problem };
  }
  return { keys };
}

/** auth_token -> SECURE_AUTH_TOKEN: the .env variable holding a key's optional starting value. */
function envName(key: string): string {
  return `SECURE_${key.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

/** Why `value` can't go in .env, or undefined if it can. Empty means "no value". */
export function keychainValueProblem(value: string | undefined): string | undefined {
  return /[\r\n]/.test(value ?? '') ? 'Values must be on one line' : undefined;
}

/** Parses repeated `--keychain-value key=value` flags. */
export function parseKeychainValues(pairs: string[]): { values: Record<string, string> } | { error: string } {
  const values: Record<string, string> = {};
  for (const pair of pairs) {
    const index = pair.indexOf('=');
    if (index < 1) return { error: `expected key=value (got "${pair}")` };
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1);
    if (key in values) return { error: `"${key}" is set twice` };
    const problem = keychainValueProblem(value);
    if (problem) return { error: `${key}: ${problem}` };
    values[key] = value;
  }
  return { values };
}

/** Quotes a .env value only when dotenv would otherwise mangle it. Single quotes are taken literally. */
function envValue(value: string): string {
  if (!/[\s#'"`\\]/.test(value)) return value;
  return value.includes("'") ? `"${value.replace(/"/g, '\\"')}"` : `'${value}'`;
}

/** Appends `lines` to a .env-style file, creating it if needed. */
function appendEnv(file: string, lines: string[]) {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
  fs.writeFileSync(file, existing + separator + lines.join('\n') + '\n');
}

/**
 * react-native-keychain 11 needs react-native 0.82+ (its peer range); 10 has
 * the same generic-password API and no peer range, so it covers older projects.
 */
function keychainVersionFor(reactNative: string): string {
  const minor = reactNativeMinor(reactNative);
  return minor !== undefined && minor < 82 ? '^10.0.0' : '^11.0.0';
}

/**
 * Adds react-native-keychain and a typed src/storage/secureStorage.ts with one
 * entry per key. Each key also gets a SECURE_<KEY> line in .env — filled with
 * `values[key]` when given, empty otherwise — that the app saves to the
 * keychain on launch while the key is empty. When `auth_token` is one of the
 * keys, the API client reads its token from the keychain instead of AsyncStorage.
 */
export function addKeychain(
  destDir: string,
  keys: string[],
  values: Record<string, string>,
  vars: TemplateVars,
) {
  // Must run after the stack's own overlays: how .env reaches the code is read from src/config/env.ts.
  // The RN CLI and Expo stacks import it from '@env' (react-native-dotenv); the Expo
  // superapp inlines EXPO_PUBLIC_* from process.env, which must be spelled out literally.
  const usesDotenv = fs
    .readFileSync(path.join(destDir, 'src', 'config', 'env.ts'), 'utf8')
    .includes("from '@env'");
  const variable = (key: string) => (usesDotenv ? envName(key) : `EXPO_PUBLIC_${envName(key)}`);

  let envImport = '';
  if (usesDotenv) {
    const names = keys.map(envName);
    const oneLine = `import { ${names.join(', ')} } from '@env';`;
    const multiLine = `import {\n${names.map(name => `  ${name},`).join('\n')}\n} from '@env';`;
    envImport = '\n' + (oneLine.length <= 100 ? oneLine : multiLine);

    const declarationsPath = path.join(destDir, 'declarations.d.ts');
    const declarations = fs.readFileSync(declarationsPath, 'utf8');
    const declare = "declare module '@env' {\n";
    fs.writeFileSync(
      declarationsPath,
      declarations.replace(declare, declare + names.map(n => `  export const ${n}: string | undefined;\n`).join('')),
    );
  }

  overlayTemplate(path.join(TEMPLATES_ROOT, 'keychain', 'overlay'), destDir, {
    ...vars,
    envImport,
    keychainKeys: keys.map(key => `'${key}'`).join(', '),
    keychainDefaults: keys
      .map(key => {
        const property = /^[A-Za-z_$][\w$]*$/.test(key) ? key : `'${key}'`;
        return `  ${property}: ${usesDotenv ? envName(key) : `process.env.${variable(key)}`},`;
      })
      .join('\n'),
  });

  const header = [
    '',
    '# Optional starting values for react-native-keychain (src/storage/secureStorage.ts),',
    '# saved to the keychain on launch while the key is empty. These are inlined into',
    '# the JS bundle — use dev/test values only, never production secrets.',
  ];
  appendEnv(path.join(destDir, '.env'), [
    ...header,
    ...keys.map(key => `${variable(key)}=${values[key] ? envValue(values[key]) : ''}`),
  ]);
  appendEnv(path.join(destDir, '.env.example'), [...header, ...keys.map(key => `${variable(key)}=`)]);
  if (keys.includes(AUTH_TOKEN_KEY)) {
    overlayTemplate(path.join(TEMPLATES_ROOT, 'keychain', 'api-overlay'), destDir, vars);
  }

  const pkgPath = path.join(destDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.dependencies = {
    ...pkg.dependencies,
    'react-native-keychain': keychainVersionFor(pkg.dependencies?.['react-native'] ?? ''),
  };
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

/**
 * The keys a scaffolded project's secureStorage.ts declares, so `add-miniapp`
 * can give a new sub-app the same ones as its host. Undefined if it has none.
 */
export function readKeychainKeys(projectDir: string): string[] | undefined {
  const file = path.join(projectDir, 'src', 'storage', 'secureStorage.ts');
  if (!fs.existsSync(file)) return undefined;
  const list = /SECURE_KEYS\s*=\s*\[([^\]]*)\]/.exec(fs.readFileSync(file, 'utf8'))?.[1];
  const keys = [...(list ?? '').matchAll(/'([^']+)'/g)].map(match => match[1]);
  return keys.length > 0 ? keys : undefined;
}
