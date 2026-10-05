import React from 'react';
import { NativeTabScreen } from '../../src/components/NativeTabScreen';
import { HomeScreen } from '../../src/screens/Home/HomeScreen';

// Route files stay thin: the screen itself lives in src/screens.
export default function HomeRoute() {
  return (
    <NativeTabScreen>
      <HomeScreen />
    </NativeTabScreen>
  );
}
