import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { MediaFile } from './Media.api';
import { MAX_PARALLEL_UPLOADS } from './Media.constants';
import { useUploadQueue, type SendFile } from './useUploadQueue';

interface PendingSend {
  file: File;
  signal: AbortSignal;
  onProgress: (sent: number, total: number) => void;
  resolve: () => void;
  reject: (error: unknown) => void;
}

function fakeSend() {
  const pending: PendingSend[] = [];
  const send: SendFile = (file, onProgress, signal) =>
    new Promise<MediaFile>((resolve, reject) => {
      pending.push({
        file,
        signal,
        onProgress,
        resolve: () => resolve({ id: file.name } as MediaFile),
        reject,
      });
    });
  return { send, pending };
}

const png = (name: string) => new File(['x'], name, { type: 'image/png' });

describe('useUploadQueue', () => {
  it('sends nothing before start', () => {
    const { send, pending } = fakeSend();
    const { result } = renderHook(() => useUploadQueue(send));
    act(() => result.current.add([png('a.png')]));
    expect(pending).toHaveLength(0);
    expect(result.current.hasWaiting).toBe(true);
  });

  it('runs two at a time and starts the next as one finishes', async () => {
    const { send, pending } = fakeSend();
    const { result } = renderHook(() => useUploadQueue(send));
    act(() => result.current.add([png('a.png'), png('b.png'), png('c.png')]));
    act(() => result.current.start());
    expect(pending).toHaveLength(MAX_PARALLEL_UPLOADS);
    await act(() => Promise.resolve(pending[0]?.resolve()));
    expect(pending).toHaveLength(3);
    expect(result.current.items.map((item) => item.status)).toEqual([
      'done',
      'uploading',
      'uploading',
    ]);
  });

  it('shows processing at 100 percent until the answer', async () => {
    const { send, pending } = fakeSend();
    const { result } = renderHook(() => useUploadQueue(send));
    act(() => result.current.add([png('a.png')]));
    act(() => result.current.start());
    act(() => pending[0]?.onProgress(1, 1));
    expect(result.current.items[0]?.status).toBe('processing');
    await act(() => Promise.resolve(pending[0]?.resolve()));
    expect(result.current.items[0]?.status).toBe('done');
  });

  it('marks a failed file and retries it alone', async () => {
    const { send, pending } = fakeSend();
    const { result } = renderHook(() => useUploadQueue(send));
    act(() => result.current.add([png('a.png'), png('b.png')]));
    act(() => result.current.start());
    await act(() => Promise.resolve(pending[0]?.reject(new Error('x'))));
    expect(result.current.items[0]?.status).toBe('failed');
    expect(result.current.items[0]?.error).toBeTruthy();
    act(() => result.current.retry(result.current.items[0]?.id as string));
    expect(pending).toHaveLength(3);
    expect(result.current.items[0]?.status).toBe('uploading');
  });

  it('aborts the uploading files and drops the waiting ones', () => {
    const { send, pending } = fakeSend();
    const { result } = renderHook(() => useUploadQueue(send));
    act(() => result.current.add([png('a.png'), png('b.png'), png('c.png')]));
    act(() => result.current.start());
    act(() => result.current.abortAll());
    expect(pending.every((call) => call.signal.aborted)).toBe(true);
    expect(result.current.items).toEqual([]);
    expect(pending).toHaveLength(MAX_PARALLEL_UPLOADS);
  });
});
