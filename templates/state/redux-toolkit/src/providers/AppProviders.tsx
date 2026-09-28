import React, { type PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { store } from '../store';
import { QueryProvider } from './QueryProvider';

/** Every app-wide provider, in one place — App.tsx wraps the navigator in this. */
export function AppProviders({ children }: PropsWithChildren) {
  return (
    <Provider store={store}>
      <QueryProvider>{children}</QueryProvider>
    </Provider>
  );
}
