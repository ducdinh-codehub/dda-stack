import React from 'react';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

// Renders with the platform's real native tab bar (UITabBarController on iOS,
// BottomNavigationView on Android) instead of a JS-drawn one. On iOS 26 + Xcode 26
// this automatically picks up the system's Liquid Glass tab bar style. Because it's
// backed by native view components, it requires a development build
// (`npx expo prebuild`), not Expo Go.
export default function TabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        {/* SF Symbols are iOS-only; Android shows the label only. */}
        <NativeTabs.Trigger.Icon sf="house.fill" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="safari.fill" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
