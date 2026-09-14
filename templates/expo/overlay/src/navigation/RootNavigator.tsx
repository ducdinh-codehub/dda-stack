import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeBottomTabNavigator } from '@react-navigation/bottom-tabs/unstable';
import { HomeScreen } from '../screens/Home/HomeScreen';
import { ExploreScreen } from '../screens/Explore/ExploreScreen';
import type { RootTabParamList } from './types';

// Renders with the platform's real native tab bar (UITabBarController on iOS,
// BottomNavigationView on Android) instead of a JS-drawn one. On iOS 26 + Xcode 26
// this automatically picks up the system's Liquid Glass tab bar style — it's the
// OS default, no extra styling needed. Because it's backed by native view
// components, it requires a development build (`npx expo prebuild`), not Expo Go.
const Tab = createNativeBottomTabNavigator<RootTabParamList>();

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={{ headerShown: true }}>
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            title: '{{projectName}}',
            tabBarLabel: 'Home',
            // SF Symbols are iOS-only (native system icons, no asset files needed).
            // Android falls back to the label only — add an `image` icon here if
            // you want a matching glyph there too.
            tabBarIcon: { type: 'sfSymbol', name: 'house.fill' },
          }}
        />
        <Tab.Screen
          name="Explore"
          component={ExploreScreen}
          options={{
            tabBarLabel: 'Explore',
            tabBarIcon: { type: 'sfSymbol', name: 'safari.fill' },
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
