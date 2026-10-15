'use client';

import { useId, useMemo, useState } from 'react';
import { AlertCircleIcon, SearchIcon } from 'lucide-react';

import { useMediaSource } from '../../hooks/use-media-source';
import { filterMedia } from '../../lib/media';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Skeleton } from '../ui/skeleton';
import { Field } from './Field';
import { FileDropzone } from './FileDropzone';
import { MediaImage } from './MediaImage';

export interface MediaPickerDialogProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The field label, for the title ("Choose cover image"). */
  label: string;
  /** The id of the asset checked when the picker opens. */
  selectedId: string | null;
  onSelect: (asset: T) => void;
}

const MESSAGE = 'flex flex-col items-start gap-3 rounded-lg border border-dashed p-6 text-sm';

/**
 * Picks an asset from the `MediaProvider`'s library: a search on the file name and a `RadioGroup`
 * grid of cards, each a `RadioGroupItem` named by the file name, so the arrow keys move the choice
 * and Enter confirms it. Upload (gated by `canUpload`) adds files, and the first asset a batch
 * adds becomes the choice. Mount it with a fresh `key` per opening.
 */
export const MediaPickerDialog = <T,>({
  open,
  onOpenChange,
  label,
  selectedId,
  onSelect,
}: MediaPickerDialogProps<T>) => {
  const source = useMediaSource<T>();
  const { describe } = source;
  const nameId = useId();
  const [search, setSearch] = useState('');
  const [choice, setChoice] = useState<string | null>(selectedId);
  const [summary, setSummary] = useState('');

  const assets = source.items ?? [];
  const visible = useMemo(
    () => filterMedia(source.items ?? [], search, describe),
    [source.items, search, describe],
  );
  const chosen = assets.find((asset) => describe(asset).id === choice);

  const confirm = (asset: T | undefined) => {
    if (asset === undefined) return;
    onSelect(asset);
    onOpenChange(false);
  };

  const upload = async (files: File[]) => {
    setSummary('');
    try {
      const result = await source.upload(files);
      if (!result) return;
      setSummary(result.summary);
      const [added] = result.added;
      if (added !== undefined) {
        setSearch('');
        setChoice(describe(added).id);
      }
    } catch (error) {
      setSummary(error instanceof Error ? error.message : String(error));
    }
  };

  let list: React.ReactNode;
  if (source.error) {
    const { forbidden = false, message } = source.error;
    list = (
      <div
        role="alert"
        className="border-destructive/40 flex flex-col items-start gap-3 rounded-lg border p-4 text-sm"
      >
        <p className="text-destructive flex items-center gap-2 font-medium">
          <AlertCircleIcon aria-hidden="true" className="size-4 shrink-0" />
          {forbidden ? "You don't have access to files." : message}
        </p>
        {!forbidden && source.refetch && (
          <Button variant="outline" size="sm" onClick={() => source.refetch?.()}>
            Retry
          </Button>
        )}
      </div>
    );
  } else if (source.items === undefined) {
    list = (
      <div role="group" aria-busy="true" aria-label="Loading files" className="flex flex-col gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  } else if (assets.length === 0) {
    list = (
      <div className={MESSAGE}>
        <p className="text-muted-foreground">No files yet.</p>
      </div>
    );
  } else if (visible.length === 0) {
    list = (
      <div className={MESSAGE}>
        <p className="text-muted-foreground">No files match &quot;{search.trim()}&quot;.</p>
      </div>
    );
  } else {
    list = (
      <RadioGroup
        aria-label="Media files"
        value={choice}
        onChange={setChoice}
        className="grid max-h-[45dvh] grid-cols-2 gap-3 overflow-y-auto p-1 sm:grid-cols-3 md:grid-cols-4"
      >
        {visible.map((asset) => {
          const file = describe(asset);
          return (
            <label
              key={file.id}
              className="bg-card hover:bg-accent has-focus-visible:outline-ring has-data-checked:border-primary has-data-checked:ring-primary relative flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-lg border text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-data-checked:ring-2"
            >
              <RadioGroupItem
                value={file.id}
                aria-labelledby={`${nameId}-${file.id}`}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  confirm(asset);
                }}
                className="bg-card absolute top-2 left-2 z-10 after:hidden focus-visible:outline-none"
              />
              <span className="bg-muted aspect-square overflow-hidden" aria-hidden="true">
                <MediaImage file={file} width={160} height={160} loading="lazy" />
              </span>
              <span
                id={`${nameId}-${file.id}`}
                className="truncate px-2 py-1.5 font-medium"
                title={file.fileName}
              >
                {file.fileName}
              </span>
            </label>
          );
        })}
      </RadioGroup>
    );
  }

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
          decision={source.canUpload}
          accept={source.accept}
          hint={source.uploadHint}
          busy={source.uploading}
          onFiles={(files) => void upload(files)}
          items={source.uploads}
          summary={summary}
        />
        <div className="max-w-sm">
          <Field label="Search files" hideLabel>
            <Input
              config={{ type: 'search', placeholder: 'Search files', autoComplete: 'off' }}
              value={search}
              onChange={setSearch}
              leading={<SearchIcon aria-hidden="true" />}
            />
          </Field>
          <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {visible.length} {visible.length === 1 ? 'file' : 'files'}
          </p>
        </div>
        {list}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button disabled={chosen === undefined} onClick={() => confirm(chosen)}>
            Select
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
MediaPickerDialog.displayName = 'MediaPickerDialog';
