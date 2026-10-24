import { Button, formatFileSize, type SheetColumn } from '@abyss/form-commons';

import { COPY } from '../../config/copy.constants';
import { formatDate } from '../../lib/date-format';
import type { MediaFile } from './media.api';

const copy = COPY.media;
const IMAGE_PREFIX = 'image/';

function Thumbnail({ file }: { file: MediaFile }) {
  const src =
    file.thumbnailUrl ??
    (file.mimeType.startsWith(IMAGE_PREFIX) ? file.url : null);
  return (
    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-muted">
      {src === null ? (
        <span className="text-xs font-medium uppercase text-muted-foreground">
          {file.mimeType.split('/')[1] ?? ''}
        </span>
      ) : (
        <img
          src={src}
          alt={file.alt ?? copy.previewFallback(file.fileName)}
          className="size-full object-cover"
        />
      )}
    </span>
  );
}

interface MediaColumnsOptions {
  canUpdate: boolean;
  canDelete: boolean;
  onEditAlt: (file: MediaFile, opener: HTMLElement) => void;
  onDelete: (file: MediaFile, opener: HTMLElement) => void;
}

/** The actions column exists only for actors who may edit or delete files. */
export function mediaColumns({
  canUpdate,
  canDelete,
  onEditAlt,
  onDelete,
}: MediaColumnsOptions): SheetColumn<MediaFile>[] {
  const actionsColumn: SheetColumn<MediaFile> = {
    key: 'actions',
    header: <span className="sr-only">{copy.columns.actions}</span>,
    align: 'right',
    renderCell: (file) => (
      <span className="whitespace-nowrap">
        {canUpdate ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={copy.editAltLabel(file.fileName)}
            onClick={(event) => onEditAlt(file, event.currentTarget)}
          >
            {copy.editAlt}
          </Button>
        ) : null}
        {canDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={copy.deleteLabel(file.fileName)}
            onClick={(event) => onDelete(file, event.currentTarget)}
          >
            {copy.deleteAction}
          </Button>
        ) : null}
      </span>
    ),
  };

  return [
    {
      key: 'file',
      header: copy.columns.file,
      rowHeader: true,
      renderCell: (file) => (
        <span className="flex items-center gap-3">
          <Thumbnail file={file} />
          <span className="min-w-0 truncate font-medium">{file.fileName}</span>
        </span>
      ),
    },
    {
      key: 'alt',
      header: copy.columns.alt,
      renderCell: (file) => (
        <span className="line-clamp-2 max-w-64" title={file.alt ?? undefined}>
          {file.alt ?? copy.noAlt}
        </span>
      ),
    },
    {
      key: 'size',
      header: copy.columns.size,
      align: 'right',
      renderCell: (file) => formatFileSize(file.size),
    },
    {
      key: 'added',
      header: copy.columns.added,
      renderCell: (file) => (
        <span className="tabular-nums">{formatDate(file.createdAt)}</span>
      ),
    },
    ...(canUpdate || canDelete ? [actionsColumn] : []),
  ];
}
