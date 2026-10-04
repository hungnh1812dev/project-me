import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppSelector } from '@/app/hooks';
import { toApiError, type ApiError } from '@/core/api/apiError';
import { useCan } from '@/features/auth/hooks/useCan';
import { can } from '@/features/auth/permissions/can';
import { guard } from '@/features/auth/permissions/guard';
import { selectActor } from '@/features/auth/store/selectors';

import { deleteMedia, getMedia, uploadMedia } from '../api/mediaApi';
import { uploadErrorMessage, validateUploadFile, type UploadSummary } from '../media';
import { settingsKeys } from '../queryKeys';
import type { MediaAsset } from '../types';

/** M1: every asset, newest first. Disabled without `media:read`, and `decision` says why. */
export function useMediaList() {
  const decision = useCan('read', 'media');
  const query = useQuery<MediaAsset[], ApiError>({
    queryKey: settingsKeys.media(),
    queryFn: ({ signal }) => getMedia(signal),
    enabled: decision.allowed,
  });
  return { ...query, decision };
}

/** Where one file of an upload batch stands (AC-37). */
export type UploadStatus = 'waiting' | 'uploading' | 'uploaded' | 'failed';

/** One file of the current upload batch. */
export interface UploadItem {
  /** Unique across batches, for React keys. */
  key: string;
  name: string;
  status: UploadStatus;
  /** Why it failed: the client-side type check or the server's answer. */
  error?: string;
}

let nextKey = 0;

/**
 * M2 as a sequential batch runner (AC-36, AC-37). `upload(files)` checks `upload media` first
 * (AC-6), rejects non-PNG/JPEG files without sending them, then sends the rest one at a time. A
 * failure does not stop the batch. `items` tracks each file's status. The media list is
 * invalidated once, after the batch, and only when something uploaded (AC-11). While a batch runs,
 * another `upload` call resolves with `null` and sends nothing.
 */
export function useUploadMedia() {
  const actor = useAppSelector(selectActor);
  const queryClient = useQueryClient();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const runningRef = useRef(false);

  const upload = useCallback(
    async (files: readonly File[]): Promise<UploadSummary | null> => {
      if (runningRef.current) return null;
      guard(can(actor, 'upload', 'media'));
      runningRef.current = true;
      setIsUploading(true);

      const batch: UploadItem[] = files.map((file) => {
        const invalid = validateUploadFile(file);
        const key = `upload-${(nextKey += 1)}`;
        return invalid
          ? { key, name: file.name, status: 'failed', error: invalid }
          : { key, name: file.name, status: 'waiting' };
      });
      setItems(batch);
      const update = (index: number, patch: Partial<UploadItem>) =>
        setItems((previous) =>
          previous.map((item, i) => (i === index ? { ...item, ...patch } : item)),
        );

      let uploaded = 0;
      try {
        for (const [index, file] of files.entries()) {
          if (batch[index]?.status === 'failed') continue;
          update(index, { status: 'uploading' });
          try {
            await uploadMedia(file);
            uploaded += 1;
            update(index, { status: 'uploaded' });
          } catch (error) {
            update(index, { status: 'failed', error: uploadErrorMessage(toApiError(error)) });
          }
        }
        if (uploaded > 0) await queryClient.invalidateQueries({ queryKey: settingsKeys.media() });
      } finally {
        runningRef.current = false;
        setIsUploading(false);
      }
      return { uploaded, total: files.length };
    },
    [actor, queryClient],
  );

  return { upload, items, isUploading };
}

/** M3: deletes an asset. Guarded by `delete media` (AC-6). */
export function useDeleteMedia() {
  const actor = useAppSelector(selectActor);
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: async (id) => {
      guard(can(actor, 'delete', 'media'));
      await deleteMedia(id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKeys.media() }),
  });
}
