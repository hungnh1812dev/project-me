import type { MediaFile } from './Media.api';
import {
  MAX_FILES_PER_BATCH,
  MAX_PARALLEL_UPLOADS,
  MEDIA_ALLOWED_MIME_TYPES,
  MEDIA_MAX_BYTES_BY_KIND,
  type MediaKind,
} from './Media.constants';

export type UploadStatus = 'waiting' | 'uploading' | 'processing' | 'done' | 'failed' | 'rejected';

export type RejectionReason = 'type-not-allowed' | 'too-large' | 'batch-full';

export interface UploadItem {
  id: string;
  file: File;
  status: UploadStatus;
  sentBytes: number;
  rejection?: RejectionReason | undefined;
  /** Message of the failed upload, as `toMediaError` words it. */
  error?: string | undefined;
  media?: MediaFile | undefined;
}

export type FileCheck = { ok: true } | { ok: false; reason: RejectionReason };

export interface UploadTotals {
  sentBytes: number;
  totalBytes: number;
}

export function mediaKindOf(mimeType: string): MediaKind | undefined {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('video/')) return 'video';
  return undefined;
}

/** `acceptedCount` is how many files the batch already holds. */
export function checkFile(file: File, acceptedCount: number): FileCheck {
  if (!MEDIA_ALLOWED_MIME_TYPES.includes(file.type)) {
    return { ok: false, reason: 'type-not-allowed' };
  }
  const kind = mediaKindOf(file.type);
  if (kind === undefined || file.size > MEDIA_MAX_BYTES_BY_KIND[kind]) {
    return { ok: false, reason: 'too-large' };
  }
  if (acceptedCount >= MAX_FILES_PER_BATCH) return { ok: false, reason: 'batch-full' };
  return { ok: true };
}

function isAccepted(item: UploadItem): boolean {
  return item.status !== 'rejected';
}

/** Adds files after the current items; each is checked against the files already accepted. */
export function addFiles(
  items: readonly UploadItem[],
  files: readonly File[],
  nextId: () => string,
): UploadItem[] {
  const result = [...items];
  let acceptedCount = result.filter(isAccepted).length;
  for (const file of files) {
    const check = checkFile(file, acceptedCount);
    if (check.ok) acceptedCount += 1;
    result.push({
      id: nextId(),
      file,
      sentBytes: 0,
      status: check.ok ? 'waiting' : 'rejected',
      rejection: check.ok ? undefined : check.reason,
    });
  }
  return result;
}

export function removeItem(items: readonly UploadItem[], id: string): UploadItem[] {
  return items.filter((item) => item.id !== id);
}

function updateItem(
  items: readonly UploadItem[],
  id: string,
  change: Partial<UploadItem>,
): UploadItem[] {
  return items.map((item) => (item.id === id ? { ...item, ...change } : item));
}

/** Ids of the waiting files to start now, never more than `MAX_PARALLEL_UPLOADS` in flight. */
export function nextToStart(items: readonly UploadItem[]): string[] {
  const inFlight = items.filter(
    (item) => item.status === 'uploading' || item.status === 'processing',
  ).length;
  const free = Math.max(0, MAX_PARALLEL_UPLOADS - inFlight);
  return items
    .filter((item) => item.status === 'waiting')
    .slice(0, free)
    .map((item) => item.id);
}

export function markUploading(items: readonly UploadItem[], id: string): UploadItem[] {
  return updateItem(items, id, { status: 'uploading', sentBytes: 0, error: undefined });
}

/** All bytes sent means `processing` until the server answers. */
export function markProgress(
  items: readonly UploadItem[],
  id: string,
  sentBytes: number,
  totalBytes: number,
): UploadItem[] {
  const isSent = sentBytes >= totalBytes;
  return updateItem(items, id, {
    status: isSent ? 'processing' : 'uploading',
    sentBytes: Math.min(sentBytes, totalBytes),
  });
}

export function markDone(items: readonly UploadItem[], id: string, media: MediaFile): UploadItem[] {
  const size = items.find((item) => item.id === id)?.file.size ?? 0;
  return updateItem(items, id, { status: 'done', sentBytes: size, media });
}

export function markFailed(items: readonly UploadItem[], id: string, error: string): UploadItem[] {
  return updateItem(items, id, { status: 'failed', sentBytes: 0, error });
}

/** Moves one failed file back to `waiting`. */
export function retryItem(items: readonly UploadItem[], id: string): UploadItem[] {
  return items.map((item) =>
    item.id === id && item.status === 'failed'
      ? { ...item, status: 'waiting', sentBytes: 0, error: undefined }
      : item,
  );
}

/** Drops waiting files and the ones being sent; finished, failed and rejected rows stay. */
export function dropUnsent(items: readonly UploadItem[]): UploadItem[] {
  return items.filter(
    (item) =>
      item.status !== 'waiting' && item.status !== 'uploading' && item.status !== 'processing',
  );
}

/** Bytes over all files being sent in this batch (rejected files do not count). */
export function totalsOf(items: readonly UploadItem[]): UploadTotals {
  return items.filter(isAccepted).reduce<UploadTotals>(
    (totals, item) => ({
      sentBytes: totals.sentBytes + (item.status === 'done' ? item.file.size : item.sentBytes),
      totalBytes: totals.totalBytes + item.file.size,
    }),
    { sentBytes: 0, totalBytes: 0 },
  );
}
