import { useCallback, useEffect, useRef, useState } from 'react';
import { useScreenText } from '@configs/locales';

import type { MediaFile } from './Media.api';
import { toMediaError } from './Media.errors';
import {
  addFiles,
  batchPercentOf,
  dropUnsent,
  markDone,
  markFailed,
  markProgress,
  markUploading,
  nextToStart,
  removeItem,
  retryItem,
  type UploadItem,
} from './UploadQueue.rules';

export type SendFile = (
  file: File,
  onProgress: (sentBytes: number, totalBytes: number | undefined) => void,
  signal: AbortSignal,
) => Promise<MediaFile>;

/** Runs an upload batch: files wait until `start`, then go out a few at a time. */
export function useUploadQueue(send: SendFile) {
  const mediaText = useScreenText('media');
  const accessText = useScreenText('access');
  const [items, setItems] = useState<UploadItem[]>([]);
  const itemsRef = useRef<UploadItem[]>([]);
  const controllersRef = useRef(new Map<string, AbortController>());
  const isRunningRef = useRef(false);
  const idCounterRef = useRef(0);
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const [batchPercent, setBatchPercent] = useState(0);
  const batchPercentRef = useRef(0);

  const commit = useCallback((next: UploadItem[]) => {
    itemsRef.current = next;
    setItems(next);
    // The batch bar never moves back, even when a failed file is retried or a row is removed.
    batchPercentRef.current =
      next.length === 0 ? 0 : Math.max(batchPercentRef.current, batchPercentOf(next));
    setBatchPercent(batchPercentRef.current);
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
            commit(
              markFailed(
                itemsRef.current,
                id,
                toMediaError(error, { ...mediaText, ...accessText }).message,
              ),
            );
          })
          .finally(pump);
      }
    },
    [commit, mediaText, accessText],
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
    batchPercent,
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
