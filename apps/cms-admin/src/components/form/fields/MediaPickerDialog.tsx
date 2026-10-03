import { useId, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@repo/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/dialog';

import { FileDropzone } from '@/components/form/FileDropzone';
import { useCan } from '@/features/auth/hooks/useCan';
import { ListState } from '@/features/settings/components/ListState';
import { SearchField } from '@/features/settings/components/SearchField';
import { useMediaList, useUploadMedia } from '@/features/settings/hooks/useMedia';
import { UPLOAD_ACCEPT, uploadSummary } from '@/features/settings/media';
import { settingsKeys } from '@/features/settings/queryKeys';
import { filterBySearch } from '@/features/settings/search';
import type { MediaAsset } from '@/features/settings/types';
import { MediaThumbnail } from '@/pages/settings/media/MediaThumbnail';

const NOUN = { one: 'file', other: 'files' };
const SEARCH_FIELDS = ['fileName'] as const;

export interface MediaPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The field label, for the title ("Choose cover image"). */
  label: string;
  /** The asset checked when the picker opens. */
  selectedId: string | null;
  onSelect: (asset: MediaAsset) => void;
}

/**
 * Picks an asset from the M1 list (AC-13): a search on the file name and a grid of native radio
 * options, so the arrow keys move the choice and Enter confirms it. Upload (gated by
 * `upload media`) adds files, and a newly uploaded asset becomes the choice. Mount it with a fresh
 * `key` per opening.
 */
export const MediaPickerDialog: React.FC<MediaPickerDialogProps> = ({
  open,
  onOpenChange,
  label,
  selectedId,
  onSelect,
}) => {
  const media = useMediaList();
  const uploads = useUploadMedia();
  const canUpload = useCan('upload', 'media');
  const queryClient = useQueryClient();
  const groupName = useId();
  const [search, setSearch] = useState('');
  const [choice, setChoice] = useState<string | null>(selectedId);
  const [summary, setSummary] = useState('');

  const assets = media.data ?? [];
  const visible = useMemo(
    () => filterBySearch(media.data ?? [], search, SEARCH_FIELDS),
    [media.data, search],
  );
  const chosen = assets.find((asset) => asset.documentId === choice);

  const confirm = (asset: MediaAsset | undefined) => {
    if (!asset) return;
    onSelect(asset);
    onOpenChange(false);
  };

  const upload = async (files: File[]) => {
    setSummary('');
    const before = new Set(assets.map((asset) => asset.documentId));
    try {
      const result = await uploads.upload(files);
      if (!result) return;
      setSummary(uploadSummary(result));
    } catch (error) {
      // Only a guard denial rejects, and the gated control already prevents it.
      setSummary(error instanceof Error ? error.message : String(error));
      return;
    }
    // The upload refetched M1; the first asset that wasn't there before is the new one.
    const after = queryClient.getQueryData<MediaAsset[]>(settingsKeys.media()) ?? [];
    const added = after.find((asset) => !before.has(asset.documentId));
    if (added) {
      setSearch('');
      setChoice(added.documentId);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Choose {label.toLowerCase()}</DialogTitle>
          <DialogDescription>
            Pick an image from the media library, or upload a new one.
          </DialogDescription>
        </DialogHeader>
        <FileDropzone
          decision={canUpload}
          accept={UPLOAD_ACCEPT}
          hint="or drop PNG or JPEG images here"
          busy={uploads.isUploading}
          onFiles={(files) => void upload(files)}
          items={uploads.items}
          summary={summary}
        />
        <SearchField
          noun={NOUN}
          value={search}
          onChange={setSearch}
          count={visible.length}
          className="max-w-sm"
        />
        <ListState
          isPending={media.isPending}
          error={media.error}
          refetch={media.refetch}
          noun={NOUN}
          total={assets.length}
          visible={visible.length}
          search={search}
        >
          <div
            role="radiogroup"
            aria-label="Media files"
            className="grid max-h-[45dvh] grid-cols-2 gap-3 overflow-y-auto p-1 sm:grid-cols-3 md:grid-cols-4"
          >
            {visible.map((asset) => (
              <label
                key={asset.documentId}
                className="flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-lg border bg-card text-sm transition-colors hover:bg-accent has-checked:border-primary has-checked:ring-2 has-checked:ring-primary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
              >
                <input
                  type="radio"
                  name={groupName}
                  value={asset.documentId}
                  aria-label={asset.fileName}
                  checked={choice === asset.documentId}
                  onChange={() => setChoice(asset.documentId)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    confirm(asset);
                  }}
                  className="sr-only"
                />
                <span className="aspect-square overflow-hidden bg-muted" aria-hidden="true">
                  <MediaThumbnail asset={asset} width={160} height={160} loading="lazy" />
                </span>
                <span className="truncate px-2 py-1.5 font-medium" title={asset.fileName}>
                  {asset.fileName}
                </span>
              </label>
            ))}
          </div>
        </ListState>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button disabled={!chosen} onClick={() => confirm(chosen)}>
            Select
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
MediaPickerDialog.displayName = 'MediaPickerDialog';
