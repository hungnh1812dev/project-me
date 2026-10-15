'use client';

import type { ReactNode } from 'react';

import { MediaSourceContext, type MediaSource } from '../../hooks/use-media-source';

export interface MediaProviderProps<T> {
  value: MediaSource<T>;
  children: ReactNode;
}

/**
 * Gives every `MediaInput` below it a media library and an upload. Wrap the app, a page or a
 * single form; the nearest provider wins.
 */
export const MediaProvider = <T,>({ value, children }: MediaProviderProps<T>) => (
  <MediaSourceContext.Provider value={value as MediaSource<unknown>}>
    {children}
  </MediaSourceContext.Provider>
);
MediaProvider.displayName = 'MediaProvider';
