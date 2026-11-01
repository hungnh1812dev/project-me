import { useCallback, useEffect, useRef, useState } from 'react';

import type { MediaFile } from './Media.api';
import { toMediaError } from './Media.errors';
import {
  addFiles,
  dropUnsent,
  markDone,
  markFailed,
  markProgress,
  markUploading,
  nextToStart,
  removeItem,
  retryItem,
  totalsOf,
  type UploadItem,
} from './UploadQueue.rules';

export type SendFile = (
  file: File,
  onProgress: (sentBytes: number, totalBytes: number) => void,
  signal: AbortSignal,
) => Promise<MediaFile>;

/** Runs an upload batch: files wait until `start`, then go out a few at a time. */
export function useUploadQueue(send: SendFile) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const itemsRef = useRef<UploadItem[]>([]);
  const controllersRef = useRef(new Map<string, AbortController>());
  const isRunningRef = useRef(false);
  const idCounterRef = useRef(0);
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const commit = useCallback((next: UploadItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const pump = useCallback(
    function pump() {
      if (!isRunningRef.current) return;
      for (const id of nextToStart(itemsRef.current)) {
        const item = itemsRef.current.find((candidate) => candidate.id === id);
        if (!item) continue;
        const controller = new AbortController();
        controllersRef.current.set(id, controller);
        commit(markUploading(itemsRef.current, id));
        const isCurrent = () => controllersRef.current.get(id) === controller;
        sendRef
          .current(
            item.file,
            (sent, total) => {
              if (isCurrent()) commit(markProgress(itemsRef.current, id, sent, total));
            },
            controller.signal,
          )
          .then((media) => {
            if (!isCurrent()) return;
            controllersRef.current.delete(id);
            commit(markDone(itemsRef.current, id, media));
          })
          .catch((error: unknown) => {
            if (!isCurrent()) return;
            controllersRef.current.delete(id);
            commit(markFailed(itemsRef.current, id, toMediaError(error).message));
          })
          .finally(pump);
      }
    },
    [commit],
  );

  const add = useCallback(
    (files: readonly File[], acceptedTypes?: readonly string[]) => {
      idCounterRef.current += 1;
      const batch = idCounterRef.current;
      let index = 0;
      commit(
        addFiles(itemsRef.current, files, () => `upload-${batch}-${(index += 1)}`, acceptedTypes),
      );
      pump();
    },
    [commit, pump],
  );

  const start = useCallback(() => {
    isRunningRef.current = true;
    pump();
  }, [pump]);

  const retry = useCallback(
    (id: string) => {
      commit(retryItem(itemsRef.current, id));
      pump();
    },
    [commit, pump],
  );

  const remove = useCallback(
    (id: string) => {
      controllersRef.current.get(id)?.abort();
      controllersRef.current.delete(id);
      commit(removeItem(itemsRef.current, id));
    },
    [commit],
  );

  const abortAll = useCallback(() => {
    isRunningRef.current = false;
    for (const controller of controllersRef.current.values()) controller.abort();
    controllersRef.current.clear();
    commit(dropUnsent(itemsRef.current));
  }, [commit]);

  const reset = useCallback(() => {
    abortAll();
    commit([]);
  }, [abortAll, commit]);

  useEffect(() => {
    const controllers = controllersRef.current;
    return () => {
      for (const controller of controllers.values()) controller.abort();
    };
  }, []);

  const isBusy = items.some((item) => item.status === 'uploading' || item.status === 'processing');
  const hasWaiting = items.some((item) => item.status === 'waiting');

  return {
    items,
    totals: totalsOf(items),
    isBusy,
    hasWaiting,
    add,
    start,
    retry,
    remove,
    abortAll,
    reset,
  };
}
