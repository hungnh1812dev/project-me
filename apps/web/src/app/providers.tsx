'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { WebSessionProvider } from '../features/session';
import { createQueryClient } from './query-client';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return (
    <QueryClientProvider client={client}>
      <WebSessionProvider>{children}</WebSessionProvider>
    </QueryClientProvider>
  );
}
