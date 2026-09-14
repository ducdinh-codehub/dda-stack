import React from 'react';
import { QueryProvider } from './src/providers/QueryProvider';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  return (
    <QueryProvider>
      <RootNavigator />
    </QueryProvider>
  );
}
