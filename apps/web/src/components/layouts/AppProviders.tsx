'use client';

import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';

import { WebSessionProvider } from '../../features/session';
import { createQueryClient } from '../../libs/QueryClient.setup';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return (
    <QueryClientProvider client={client}>
      <WebSessionProvider>{children}</WebSessionProvider>
    </QueryClientProvider>
  );
}
