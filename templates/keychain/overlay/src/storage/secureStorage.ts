import * as Keychain from 'react-native-keychain';{{envImport}}

/**
 * Values kept in the iOS Keychain / Android Keystore instead of AsyncStorage —
 * use it for tokens and other secrets. Add a key here to store something new.
 */
export const SECURE_KEYS = [{{keychainKeys}}] as const;

export type SecureKey = (typeof SECURE_KEYS)[number];

/**
 * Optional starting values from .env — each is saved to the keychain on launch
 * while that key is still empty. .env is inlined into the JS bundle, so only
 * put dev/test values there; save real secrets at runtime with setSecureItem.
 */
const DEFAULTS: Record<SecureKey, string | undefined> = {
{{keychainDefaults}}
};

// One keychain entry per key. The prefix keeps them apart from other apps'
// entries, and is the same in a superapp's host and sub-apps so they share them.
const service = (key: SecureKey) => `{{projectSlug}}.${key}`;

async function write(key: SecureKey, value: string): Promise<void> {
  const result = await Keychain.setGenericPassword(key, value, { service: service(key) });
  if (!result) throw new Error(`Couldn't save "${key}" to the keychain`);
}

let seeding: Promise<void> | undefined;

/** Saves DEFAULTS into empty keys, once per launch. Every call below waits for it. */
function seedDefaults(): Promise<void> {
  seeding ??= Promise.all(
    SECURE_KEYS.map(async key => {
      const value = DEFAULTS[key];
      if (value && !(await Keychain.getGenericPassword({ service: service(key) }))) {
        await write(key, value);
      }
    }),
  ).then(
    () => undefined,
    error => console.warn("Couldn't save the .env defaults to the keychain", error),
  );
  return seeding;
}

export async function setSecureItem(key: SecureKey, value: string): Promise<void> {
  await seedDefaults();
  await write(key, value);
}

/** The stored value, or null if nothing is saved under `key`. */
export async function getSecureItem(key: SecureKey): Promise<string | null> {
  await seedDefaults();
  const credentials = await Keychain.getGenericPassword({ service: service(key) });
  return credentials ? credentials.password : null;
}

/** Removes `key`. A .env default for it comes back on the next launch. */
export async function removeSecureItem(key: SecureKey): Promise<void> {
  await seedDefaults();
  await Keychain.resetGenericPassword({ service: service(key) });
}

/** Removes every key above — e.g. on sign-out. */
export async function clearSecureItems(): Promise<void> {
  await Promise.all(SECURE_KEYS.map(removeSecureItem));
}
