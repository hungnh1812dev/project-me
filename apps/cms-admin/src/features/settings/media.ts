import type { ApiError } from '@/core/api/apiError';

// Pure helpers for the media library (AC-35 to AC-37). There is no client-side size check (D7):
// the server's 413 is the only size limit.

/** The file input's `accept` list. */
export const UPLOAD_ACCEPT = 'image/png,image/jpeg';

const MIME_TYPES = new Set(['image/png', 'image/jpeg']);
const EXTENSIONS = new Set(['png', 'jpg', 'jpeg']);

/**
 * `null` when `file` is a PNG or JPEG by both MIME type and extension, otherwise the message
 * "<name>: only PNG and JPEG images are supported." (AC-36).
 */
export function validateUploadFile(file: Pick<File, 'name' | 'type'> & { size?: number }) {
  const dot = file.name.lastIndexOf('.');
  const extension = dot === -1 ? '' : file.name.slice(dot + 1).toLowerCase();
  if (MIME_TYPES.has(file.type) && EXTENSIONS.has(extension)) return null;
  return `${file.name}: only PNG and JPEG images are supported.`;
}

const UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/** A byte count in binary units with at most one decimal, for example "1.2 MB" (AC-35). */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 ? value : Math.round(value * 10) / 10;
  return `${rounded} ${UNITS[unit]}`;
}

/** The reason a single upload failed (AC-37): 413 and 422 get fixed copy, others the server's. */
export function uploadErrorMessage(error: ApiError): string {
  if (error.status === 413) return 'File is too large.';
  if (error.status === 422) return 'Unsupported file type.';
  return error.message;
}

/** How one upload batch ended. */
export interface UploadSummary {
  uploaded: number;
  total: number;
}

/** The polite end-of-batch message, for example "2 of 3 files uploaded." (AC-37). */
export function uploadSummary({ uploaded, total }: UploadSummary): string {
  return `${uploaded} of ${total} ${total === 1 ? 'file' : 'files'} uploaded.`;
}
