import React from 'react';
import { NativeTabScreen } from '../../src/components/NativeTabScreen';
import { ExploreScreen } from '../../src/screens/Explore/ExploreScreen';

export default function ExploreRoute() {
  return (
    <NativeTabScreen>
      <ExploreScreen />
    </NativeTabScreen>
  );
}
