import { createContext, type ReactNode, use } from 'react';

import type { MediaApi } from './media.api';

const MediaApiContext = createContext<MediaApi | null>(null);

export function MediaApiProvider({
  api,
  children,
}: {
  api: MediaApi;
  children: ReactNode;
}) {
  return <MediaApiContext value={api}>{children}</MediaApiContext>;
}

export function useMediaApi(): MediaApi {
  const api = use(MediaApiContext);
  if (api === null) {
    throw new Error('useMediaApi must be used inside <MediaApiProvider>.');
  }
  return api;
}
