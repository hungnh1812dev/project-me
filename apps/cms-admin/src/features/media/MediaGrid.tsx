import type { ReactNode } from 'react';
import { Button, IconButton, MediaDetails, MediaPreview } from '@abyss/form-commons';
import { COPY } from '@configs/Copy.constants';
import { ExternalLink, ImageIcon, Pencil, Replace, Trash2 } from 'lucide-react';

import type { MediaFile } from './Media.api';

const copy = COPY.media;
const IMAGE_PREFIX = 'image/';
const SKELETON_CARD_COUNT = 6;
const CARD_LABELS = { previewFallback: copy.previewFallback, videoBadge: copy.videoBadge };
const GRID_CLASSES = 'm-0 grid list-none grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-4 p-0';

/** Library actions of manage mode; an action left out is not shown. */
export interface MediaGridActions {
  onEditAlt?: (file: MediaFile, opener: HTMLElement) => void;
  onReplace?: (file: MediaFile, opener: HTMLElement) => void;
  onDelete?: (file: MediaFile, opener: HTMLElement) => void;
}

interface MediaGridProps {
  files: readonly MediaFile[];
  /** `manage` shows the actions on each card; `pick` makes a card one button. */
  mode: 'manage' | 'pick';
  actions?: MediaGridActions;
  onSelect?: (file: MediaFile) => void;
  isLoading?: boolean;
  /** Shown in place of the grid when loading failed. */
  error?: ReactNode;
  emptyTitle: string;
  emptyHint?: string;
}

function CardActions({ file, actions }: { file: MediaFile; actions: MediaGridActions }) {
  const { onEditAlt, onReplace, onDelete } = actions;
  const isImage = file.mimeType.startsWith(IMAGE_PREFIX);
  return (
    <>
      {isImage ? (
        <Button
          asChild
          size="icon"
          variant="ghost"
          aria-label={copy.grid.viewOriginal(file.fileName)}
          title={copy.grid.viewOriginal(file.fileName)}
        >
          <a href={file.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden="true" />
          </a>
        </Button>
      ) : null}
      {onEditAlt === undefined ? null : (
        <IconButton
          type="button"
          variant="ghost"
          label={copy.editAltLabel(file.fileName)}
          onClick={(event) => onEditAlt(file, event.currentTarget)}
        >
          <Pencil aria-hidden="true" />
        </IconButton>
      )}
      {onReplace === undefined ? null : (
        <IconButton
          type="button"
          variant="ghost"
          label={copy.grid.replaceLabel(file.fileName)}
          onClick={(event) => onReplace(file, event.currentTarget)}
        >
          <Replace aria-hidden="true" />
        </IconButton>
      )}
      {onDelete === undefined ? null : (
        <IconButton
          type="button"
          variant="ghost"
          label={copy.deleteLabel(file.fileName)}
          onClick={(event) => onDelete(file, event.currentTarget)}
        >
          <Trash2 aria-hidden="true" />
        </IconButton>
      )}
    </>
  );
}

function GridSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">{copy.loading}</span>
      <ul aria-hidden="true" className={GRID_CLASSES}>
        {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
          <li
            key={index}
            className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-md border border-border bg-card p-3"
          >
            <div className="h-(--size-media-card-preview) animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string | undefined }) {
  return (
    <div className="grid justify-items-start gap-1 rounded-md border border-dashed border-border bg-card p-6">
      <ImageIcon aria-hidden="true" className="size-6 text-muted-foreground" />
      <p className="m-0 text-sm font-medium">{title}</p>
      {hint === undefined ? null : <p className="m-0 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Responsive cards of library files, with loading, error and empty states. */
export function MediaGrid({
  files,
  mode,
  actions = {},
  onSelect,
  isLoading = false,
  error,
  emptyTitle,
  emptyHint,
}: MediaGridProps) {
  if (error !== undefined && error !== null) return <>{error}</>;
  if (isLoading) return <GridSkeleton />;
  if (files.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint} />;

  return (
    <ul aria-label={copy.grid.label} className={GRID_CLASSES}>
      {files.map((file) => (
        <li key={file.id} className="min-w-0">
          {mode === 'pick' ? (
            <button
              type="button"
              aria-label={COPY.media.picker.select(file.fileName)}
              onClick={() => onSelect?.(file)}
              className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)] gap-3 rounded-md border border-border bg-card p-3 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              <MediaPreview file={file} height="card" labels={CARD_LABELS} />
              <MediaDetails file={file} />
            </button>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-md border border-border bg-card p-3">
              <MediaPreview
                file={file}
                height="card"
                labels={CARD_LABELS}
                actions={<CardActions file={file} actions={actions} />}
              />
              <MediaDetails file={file} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
