import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  formatFileSize,
  FormAlert,
} from '@abyss/form-commons';
import { useState } from 'react';

import { COPY } from '../../config/copy.constants';
import { isForbidden } from '../access/access-error';
import { LoadError, TableSkeleton } from '../../components/PageStates';
import { Pagination } from '../../components/Pagination';
import { useMediaQuery } from './media-queries';
import type { MediaFile } from './media.api';

const copy = COPY.media.picker;
const IMAGE_PREFIX = 'image/';

function Thumb({ file }: { file: MediaFile }) {
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
        <img src={src} alt="" className="size-full object-cover" />
      )}
    </span>
  );
}

/** Pick one library file for a media field. */
export function MediaPickerDialog({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (file: MediaFile) => void;
}) {
  const [page, setPage] = useState(1);
  const media = useMediaQuery(page);
  const rows = media.data?.data ?? [];

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        {media.isPending ? (
          <TableSkeleton label={copy.loading} />
        ) : media.isError ? (
          isForbidden(media.error) ? (
            <FormAlert tone="info">{COPY.media.forbidden}</FormAlert>
          ) : (
            <LoadError
              message={COPY.media.loadFailed}
              retrying={media.isFetching}
              onRetry={() => void media.refetch()}
            />
          )
        ) : rows.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">{copy.empty}</p>
        ) : (
          <div className="rounded-md border border-border bg-card">
            <ul className="m-0 grid max-h-96 list-none gap-0 overflow-y-auto p-0">
              {rows.map((file) => (
                <li
                  key={file.id}
                  className="border-b border-border last:border-0"
                >
                  <button
                    type="button"
                    aria-label={copy.select(file.fileName)}
                    onClick={() => onSelect(file)}
                    className="flex w-full items-center gap-3 bg-transparent px-3 py-2 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <Thumb file={file} />
                    <span className="grid min-w-0 gap-0.5">
                      <span className="truncate text-sm font-medium">
                        {file.fileName}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {file.alt ?? COPY.media.noAlt} ·{' '}
                        <span className="tabular-nums">
                          {formatFileSize(file.size)}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {media.data === undefined ? null : (
              <Pagination
                meta={media.data.meta}
                count={rows.length}
                onPage={setPage}
                copy={COPY.media.pagination}
              />
            )}
          </div>
        )}
        <div className="flex justify-end">
          <Button type="button" onClick={onClose}>
            {copy.cancel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
