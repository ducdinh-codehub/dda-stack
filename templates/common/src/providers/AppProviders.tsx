import React, { type PropsWithChildren } from 'react';
import { QueryProvider } from './QueryProvider';

/** Every app-wide provider, in one place — App.tsx wraps the navigator in this. */
export function AppProviders({ children }: PropsWithChildren) {
  return <QueryProvider>{children}</QueryProvider>;
}
