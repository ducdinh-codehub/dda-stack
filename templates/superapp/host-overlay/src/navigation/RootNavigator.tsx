import React from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeScreen } from '../screens/Home/HomeScreen';
import { ExploreScreen } from '../screens/Explore/ExploreScreen';
import { createMiniAppScreen } from '../miniapps/createMiniAppScreen';
import miniApps from '../../miniapps.json';
import type { RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

// Defined once at module level — an inline arrow in `options` would be a new
// component on every render (react/no-unstable-nested-components).
const HomeIcon = ({ size }: { size: number }) => <Text style={{ fontSize: size }}>🏠</Text>;
const ExploreIcon = ({ size }: { size: number }) => <Text style={{ fontSize: size }}>🧭</Text>;

// One tab per entry in miniapps.json — `npx create-dda-stack add-miniapp <name>`
// adds entries there. Built at module level for the same reason as the icons.
const miniAppTabs = miniApps.map(app => ({
  name: app.name,
  title: app.title,
  component: createMiniAppScreen(app.name),
  icon: ({ size }: { size: number }) => <Text style={{ fontSize: size }}>{app.icon}</Text>,
}));

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
        {miniAppTabs.map(tab => (
          <Tab.Screen
            key={tab.name}
            name={tab.name}
            component={tab.component}
            options={{
              title: tab.title,
              tabBarLabel: tab.title,
              tabBarIcon: tab.icon,
            }}
          />
        ))}
      </Tab.Navigator>
    </NavigationContainer>
  );
}
