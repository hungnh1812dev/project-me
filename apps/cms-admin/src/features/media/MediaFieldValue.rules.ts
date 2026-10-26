import type { MediaInputFile } from '@abyss/form-commons';

import type { MediaFile } from './Media.api';

/** A document's embedded file (or a stored value) as the field holds it; anything else is empty. */
export function mediaToForm(value: unknown): MediaInputFile | null {
  if (typeof value !== 'object' || value === null) return null;
  const file = value as Partial<MediaInputFile>;
  return typeof file.id === 'string' && typeof file.fileName === 'string'
    ? (file as MediaInputFile)
    : null;
}

/** The API takes the file uuid; null detaches the file. */
export function mediaToApi(value: unknown): string | null {
  return mediaToForm(value)?.id ?? null;
}

/** A library row as the field shows it. */
export function libraryFileToInput(file: MediaFile): MediaInputFile {
  return {
    id: file.id,
    fileName: file.fileName,
    mimeType: file.mimeType,
    size: file.size,
    url: file.url,
    thumbnailUrl: file.thumbnailUrl,
    alt: file.alt,
    provider: file.provider,
    createdAt: file.createdAt,
  };
}
