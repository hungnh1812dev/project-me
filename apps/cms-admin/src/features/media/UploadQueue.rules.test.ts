import { describe, expect, it } from 'vitest';

import type { MediaFile } from './Media.api';
import {
  MAX_FILES_PER_BATCH,
  MAX_PARALLEL_UPLOADS,
  MEDIA_ALLOWED_MIME_TYPES,
  MEDIA_MAX_BYTES_BY_KIND,
} from './Media.constants';
import {
  addFiles,
  batchPercentOf,
  checkFile,
  dropUnsent,
  hasDeterminateProgress,
  markDone,
  markFailed,
  markProgress,
  markUploading,
  nextToStart,
  retryItem,
  sentPercentOf,
  UPLOAD_SENT_SHARE,
} from './UploadQueue.rules';

function fileOf(type: string, size = 10): File {
  const file = new File(['x'], 'f', { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

let counter = 0;
const nextId = () => `id-${(counter += 1)}`;
const media = { id: 'm1' } as MediaFile;
const png = (size = 10) => fileOf('image/png', size);

describe('checkFile', () => {
  it('accepts every allowed type within its limit', () => {
    for (const type of MEDIA_ALLOWED_MIME_TYPES)
      expect(checkFile(fileOf(type), 0)).toEqual({ ok: true });
  });

  it('rejects a type outside the allowlist', () => {
    expect(checkFile(fileOf('image/svg+xml'), 0)).toEqual({
      ok: false,
      reason: 'type-not-allowed',
    });
  });

  it('rejects a file over the limit of its kind but accepts the limit itself', () => {
    expect(checkFile(png(MEDIA_MAX_BYTES_BY_KIND.image), 0)).toEqual({ ok: true });
    expect(checkFile(png(MEDIA_MAX_BYTES_BY_KIND.image + 1), 0)).toEqual({
      ok: false,
      reason: 'too-large',
    });
    expect(checkFile(fileOf('application/pdf', MEDIA_MAX_BYTES_BY_KIND.pdf + 1), 0).ok).toBe(false);
    expect(checkFile(fileOf('video/mp4', MEDIA_MAX_BYTES_BY_KIND.video), 0).ok).toBe(true);
  });

  it('rejects when the batch is full', () => {
    expect(checkFile(png(), MAX_FILES_PER_BATCH)).toEqual({ ok: false, reason: 'batch-full' });
  });
});

describe('addFiles', () => {
  it('flags rejected files and leaves them out of the batch count', () => {
    const items = addFiles([], [png(), fileOf('text/plain')], nextId);
    expect(items.map((item) => item.status)).toEqual(['waiting', 'rejected']);
    expect(items[1]?.rejection).toBe('type-not-allowed');
  });

  it('rejects the files past the batch limit', () => {
    const files = Array.from({ length: MAX_FILES_PER_BATCH + 2 }, () => png());
    const items = addFiles([], files, nextId);
    expect(items.filter((item) => item.status === 'waiting')).toHaveLength(MAX_FILES_PER_BATCH);
    expect(items.filter((item) => item.rejection === 'batch-full')).toHaveLength(2);
  });
});

describe('nextToStart', () => {
  it('never lets more than the parallel limit be in flight', () => {
    let items = addFiles([], [png(), png(), png(), png()], nextId);
    const first = nextToStart(items);
    expect(first).toHaveLength(MAX_PARALLEL_UPLOADS);
    for (const id of first) items = markUploading(items, id);
    expect(nextToStart(items)).toEqual([]);
    items = markDone(items, first[0] as string, media);
    expect(nextToStart(items)).toHaveLength(1);
  });

  it('counts a processing file as in flight', () => {
    let items = addFiles([], [png(10), png(10), png(10)], nextId);
    for (const id of nextToStart(items)) items = markUploading(items, id);
    items = markProgress(items, items[0]?.id as string, 10, 10);
    expect(items[0]?.status).toBe('processing');
    expect(nextToStart(items)).toEqual([]);
  });
});

describe('progress and batchPercentOf', () => {
  it('moves uploading to processing once every byte is sent', () => {
    let items = addFiles([], [png(100)], nextId);
    const id = items[0]?.id as string;
    items = markProgress(markUploading(items, id), id, 40, 100);
    expect(items[0]?.status).toBe('uploading');
    expect(sentPercentOf(items[0] as never)).toBe(40);
    items = markProgress(items, id, 100, 100);
    expect(items[0]?.status).toBe('processing');
    expect(hasDeterminateProgress(items[0] as never)).toBe(false);
  });

  it('keeps an unknown total uploading and indeterminate', () => {
    let items = addFiles([], [png(100)], nextId);
    const id = items[0]?.id as string;
    items = markProgress(markUploading(items, id), id, 500, undefined);
    expect(items[0]?.status).toBe('uploading');
    expect(hasDeterminateProgress(items[0] as never)).toBe(false);
  });

  it('weighs files by size and stays below 100 until every file answered', () => {
    let items = addFiles([], [png(100), png(300), fileOf('text/plain', 999)], nextId);
    const [a, b] = [items[0]?.id as string, items[1]?.id as string];
    items = markProgress(markUploading(items, a), a, 100, 100);
    expect(batchPercentOf(items)).toBe(Math.floor(UPLOAD_SENT_SHARE * 25));
    items = markDone(markUploading(items, b), b, media);
    expect(batchPercentOf(items)).toBe(Math.floor((300 + 90) / 4));
    items = markDone(items, a, media);
    expect(batchPercentOf(items)).toBe(100);
  });

  it('counts a failed file as settled', () => {
    let items = addFiles([], [png(100)], nextId);
    const id = items[0]?.id as string;
    items = markFailed(markUploading(items, id), id, 'x');
    expect(batchPercentOf(items)).toBe(100);
  });
});

describe('retryItem and dropUnsent', () => {
  it('moves only the chosen failed file back to waiting', () => {
    let items = addFiles([], [png(), png()], nextId);
    items = markFailed(
      markFailed(items, items[0]?.id as string, 'boom'),
      items[1]?.id as string,
      'boom',
    );
    items = retryItem(items, items[0]?.id as string);
    expect(items.map((item) => item.status)).toEqual(['waiting', 'failed']);
    expect(items[0]?.error).toBeUndefined();
  });

  it('keeps done, failed and rejected rows when unsent files are dropped', () => {
    let items = addFiles([], [png(), png(), png(), fileOf('text/plain')], nextId);
    items = markDone(items, items[0]?.id as string, media);
    items = markFailed(items, items[1]?.id as string, 'boom');
    items = markUploading(items, items[2]?.id as string);
    expect(dropUnsent(items).map((item) => item.status)).toEqual(['done', 'failed', 'rejected']);
  });
});
