// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  // Last, so formatting is left to Prettier instead of fighting ESLint rules.
  prettierConfig,
  {
    rules: {
      // `@env` is a virtual module made by the react-native-dotenv Babel
      // plugin — there's no file on disk for the import resolver to find.
      'import/no-unresolved': ['error', { ignore: ['^@env$'] }],
      // Misfires on the standard `axios.create(...)` call.
      'import/no-named-as-default-member': 'off',
    },
  },
  {
    // expo's config only registers the TypeScript plugin for TS files.
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Allows React Navigation's documented global typing pattern:
      // `interface RootParamList extends RootTabParamList {}`.
      '@typescript-eslint/no-empty-object-type': [
        'error',
        { allowInterfaces: 'with-single-extends' },
      ],
    },
  },
  {
    ignores: ['dist/*', 'ios/*', 'android/*', '.expo/*'],
  },
]);
