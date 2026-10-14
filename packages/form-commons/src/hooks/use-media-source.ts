import { createContext, useContext } from 'react';

import type { FileStatusItem } from '../components/forms/FileDropzone';
import type { Decision } from '../lib/decision';
import type { MediaFile } from '../lib/media';

/** How an upload batch ended. */
export interface MediaUploadResult<T> {
  /** The assets the batch added; the picker selects the first one. */
  added: T[];
  /** The end-of-batch message, for example "2 of 3 files uploaded." */
  summary: string;
}

/**
 * Where `MediaInput` gets its library and uploads from. The app builds it from its own data
 * layer (queries, permissions, URL rules) and passes it to `MediaProvider`.
 */
export interface MediaSource<T> {
  /** The library, or `undefined` while it loads (or while browsing isn't allowed). */
  items: readonly T[] | undefined;
  /** Why the library failed to load; `forbidden` hides Retry. */
  error?: { message: string; forbidden?: boolean } | null;
  refetch?: () => void;
  /** How the UI shows an asset. Must be stable enough to call on every render. */
  describe: (asset: T) => MediaFile;
  /** Gates Choose. A denial keeps the button visible but inert, with the reason. */
  canBrowse: Decision;
  /** Gates the picker's upload. */
  canUpload: Decision;
  /** Uploads a batch. `null` when nothing ran (a batch is already running). */
  upload: (files: File[]) => Promise<MediaUploadResult<T> | null>;
  /** The current batch, listed under the dropzone. */
  uploads: readonly FileStatusItem[];
  uploading: boolean;
  /** The file input's `accept` list, for example "image/png,image/jpeg". */
  accept: string;
  /** Shown beside the upload button, for example "or drop PNG or JPEG images here". */
  uploadHint: string;
  /**
   * The URL to put in `<img src>`, or `null` for a placeholder. Defaults to `defaultImageSrc`
   * (`https:` or the page's own origin).
   */
  imageSrc?: (url: string | undefined) => string | null;
}

export const MediaSourceContext = createContext<MediaSource<unknown> | null>(null);

/** The nearest `MediaProvider`'s source. Throws outside one, naming the missing provider. */
export function useMediaSource<T>(): MediaSource<T> {
  const source = useContext(MediaSourceContext);
  if (!source) throw new Error('MediaInput needs a <MediaProvider> above it.');
  return source as MediaSource<T>;
}
