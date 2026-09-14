import React from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeScreen } from '../screens/Home/HomeScreen';
import { ExploreScreen } from '../screens/Explore/ExploreScreen';
import type { RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={{ headerShown: true }}>
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            title: 'test',
            tabBarLabel: 'Home',
            tabBarIcon: ({ size }) => <Text style={{ fontSize: size }}>🏠</Text>,
          }}
        />
        <Tab.Screen
          name="Explore"
          component={ExploreScreen}
          options={{
            tabBarLabel: 'Explore',
            tabBarIcon: ({ size }) => <Text style={{ fontSize: size }}>🧭</Text>,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
