import type { Readable } from 'node:stream';

import type { MediaKind } from '../../modules/media';

/** DI token for the configured `MediaStorage` (MEDIA_PROVIDER). */
export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');

export interface PutObjectInput {
  /** UUIDv7 storage key (D12); the provider must store the object under it. */
  readonly key: string;
  readonly kind: MediaKind;
  /** Detected from the magic bytes, never the client-declared type. */
  readonly mimeType: string;
  readonly body: Readable;
}

export interface StoredObject {
  /** Public delivery URL. */
  readonly url: string;
  /** Present for images only. */
  readonly thumbnailUrl: string | null;
}

/**
 * Where media bytes live (SPEC D12). The upload pipeline has already
 * validated and re-encoded the bytes; the adapter only stores them.
 */
export interface MediaStorage {
  put(input: PutObjectInput): Promise<StoredObject>;
  /** Removes the object; deleting a missing object is not an error. */
  delete(key: string, kind: MediaKind): Promise<void>;
}
