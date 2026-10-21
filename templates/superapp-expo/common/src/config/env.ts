// Re.Pack's ExpoPlugin inlines EXPO_PUBLIC_* variables from .env at build
// time, like Expo's own bundler does — restart `npm start` after changing it.
export const ENV = {
  API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL || 'https://api.example.com',
} as const;
