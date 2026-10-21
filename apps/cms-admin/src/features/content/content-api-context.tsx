import { createContext, type ReactNode, use } from 'react';

import type { ContentApi } from './content.api';

const ContentApiContext = createContext<ContentApi | null>(null);

export function ContentApiProvider({
  api,
  children,
}: {
  api: ContentApi;
  children: ReactNode;
}) {
  return <ContentApiContext value={api}>{children}</ContentApiContext>;
}

export function useContentApi(): ContentApi {
  const api = use(ContentApiContext);
  if (api === null) {
    throw new Error('useContentApi must be used inside <ContentApiProvider>.');
  }
  return api;
}
