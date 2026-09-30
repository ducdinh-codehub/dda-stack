import React from 'react';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';

// SDK 54's expo-router (v6) exports Label/Icon on their own; from SDK 55 they
// moved to NativeTabs.Trigger.Label/Icon. Otherwise identical to the SDK 55+
// layout: a real native tab bar that needs a development build, not Expo Go.
export default function TabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Label>Home</Label>
        {/* SF Symbols are iOS-only; Android shows the label only. */}
        <Icon sf="house.fill" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="explore">
        <Label>Explore</Label>
        <Icon sf="safari.fill" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
