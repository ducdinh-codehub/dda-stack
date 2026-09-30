import React from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeScreen } from '../screens/Home/HomeScreen';
import { ExploreScreen } from '../screens/Explore/ExploreScreen';
import type { RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

// Defined once at module level — an inline arrow in `options` would be a new
// component on every render (react/no-unstable-nested-components).
const HomeIcon = ({ size }: { size: number }) => <Text style={{ fontSize: size }}>🏠</Text>;
const ExploreIcon = ({ size }: { size: number }) => <Text style={{ fontSize: size }}>🧭</Text>;

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
            tabBarIcon: HomeIcon,
          }}
        />
        <Tab.Screen
          name="Explore"
          component={ExploreScreen}
          options={{
            tabBarLabel: 'Explore',
            tabBarIcon: ExploreIcon,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
