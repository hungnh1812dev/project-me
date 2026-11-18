import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  FormAlert,
} from '@abyss/form-commons';
import { LoadError } from '@components/PageStates';
import { Pagination } from '@components/Pagination';
import { useScreenText } from '@configs/locales';

import { isForbidden } from '../access';
import type { MediaFile } from './Media.api';
import { MEDIA_DEFAULT_PAGE_SIZE, MEDIA_MIME_ALL } from './Media.constants';
import { useMediaQuery } from './Media.queries';
import { MediaFilters, type MediaFiltersValue } from './MediaFilters';
import { MediaGrid } from './MediaGrid';

const IMAGES_ONLY_MIME_TYPE = 'image/*';

/** Pick one library file for a media field. */
export function MediaPickerDialog({
  open,
  onClose,
  onSelect,
  onlyImages = false,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (file: MediaFile) => void;
  onlyImages?: boolean;
}) {
  const mediaCopy = useScreenText('media').media;
  const copy = mediaCopy.picker;
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<MediaFiltersValue>({
    search: '',
    mimeType: onlyImages ? IMAGES_ONLY_MIME_TYPE : MEDIA_MIME_ALL,
    pageSize: MEDIA_DEFAULT_PAGE_SIZE,
  });
  const media = useMediaQuery({ page, ...filters });
  const rows = media.data?.data ?? [];
  const isFiltered = filters.search !== '' || (!onlyImages && filters.mimeType !== MEDIA_MIME_ALL);

  const loadError = media.isError ? (
    isForbidden(media.error) ? (
      <FormAlert tone="info">{mediaCopy.forbidden}</FormAlert>
    ) : (
      <LoadError
        message={mediaCopy.loadFailed}
        isRetrying={media.isFetching}
        onRetry={() => void media.refetch()}
      />
    )
  ) : undefined;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <MediaFilters
          value={filters}
          hideMimeType={onlyImages}
          onChange={(next) => {
            setFilters(next);
            setPage(1);
          }}
        />
        <MediaGrid
          mode="pick"
          files={rows}
          isLoading={media.isPending}
          error={loadError}
          onSelect={onSelect}
          emptyTitle={isFiltered ? mediaCopy.grid.noResults : copy.empty}
          {...(isFiltered ? { emptyHint: mediaCopy.grid.noResultsHint } : {})}
        />
        {media.data === undefined || rows.length === 0 ? null : (
          <Pagination
            meta={media.data.meta}
            count={rows.length}
            onPage={setPage}
            copy={mediaCopy.pagination}
          />
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
