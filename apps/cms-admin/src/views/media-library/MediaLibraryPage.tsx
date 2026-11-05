import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Button, FormAlert, type FormAlertTone } from '@abyss/form-commons';
import { LoadError, PageHeader } from '@components/PageStates';
import { Pagination } from '@components/Pagination';
import { useRestoreFocus } from '@components/useRestoreFocus';
import { useScreenText } from '@configs/locales';
import { isForbidden, useCallerAccess } from '@features/access';
import type { MediaFile } from '@features/media/Media.api';
import {
  MEDIA_ALLOWED_MIME_TYPES,
  MEDIA_DEFAULT_PAGE_SIZE,
  MEDIA_MIME_ALL,
  MEDIA_MIME_FILTER_VALUES,
  MEDIA_PAGE_SIZES,
  MEDIA_SUBJECT,
} from '@features/media/Media.constants';
import { MEDIA_QUERY_KEY, useMediaQuery } from '@features/media/Media.queries';
import { useMediaApi } from '@features/media/MediaApi.context';
import { MediaFilters, type MediaFiltersValue } from '@features/media/MediaFilters';
import { MediaGrid } from '@features/media/MediaGrid';
import { UploadDialog } from '@features/media/UploadDialog';
import type { SendFile } from '@features/media/useUploadQueue';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';

import { DeleteMediaDialog } from './DeleteMediaDialog';
import { EditAltDialog } from './EditAltDialog';

const QUERY_KEYS = {
  page: 'page',
  pageSize: 'pageSize',
  search: 'search',
  mimeType: 'mimeType',
} as const;
const FIRST_PAGE = 1;
const SEARCH_MAX_LENGTH = 100;

interface LibraryQuery extends MediaFiltersValue {
  page: number;
}

interface Notice {
  tone: FormAlertTone;
  message: string;
}

/** Reads the URL query; a missing or invalid value falls back to its default. */
function readQuery(params: URLSearchParams): LibraryQuery {
  const page = Number(params.get(QUERY_KEYS.page));
  const pageSize = Number(params.get(QUERY_KEYS.pageSize));
  const mimeType = params.get(QUERY_KEYS.mimeType) ?? MEDIA_MIME_ALL;
  return {
    page: Number.isInteger(page) && page >= FIRST_PAGE ? page : FIRST_PAGE,
    pageSize: (MEDIA_PAGE_SIZES as readonly number[]).includes(pageSize)
      ? pageSize
      : MEDIA_DEFAULT_PAGE_SIZE,
    search: (params.get(QUERY_KEYS.search) ?? '').trim().slice(0, SEARCH_MAX_LENGTH),
    mimeType: MEDIA_MIME_FILTER_VALUES.includes(mimeType) ? mimeType : MEDIA_MIME_ALL,
  };
}

/** Writes only the values that differ from their defaults. */
function writeQuery(query: LibraryQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.page !== FIRST_PAGE) params.set(QUERY_KEYS.page, String(query.page));
  if (query.pageSize !== MEDIA_DEFAULT_PAGE_SIZE) {
    params.set(QUERY_KEYS.pageSize, String(query.pageSize));
  }
  if (query.search !== '') params.set(QUERY_KEYS.search, query.search);
  if (query.mimeType !== MEDIA_MIME_ALL) params.set(QUERY_KEYS.mimeType, query.mimeType);
  return params;
}

/** A replacement must stay in the family of the file it replaces (image, PDF, video). */
function replacementTypes(file: MediaFile): readonly string[] {
  const family = file.mimeType.split('/')[0] ?? '';
  return MEDIA_ALLOWED_MIME_TYPES.filter((type) => type.startsWith(`${family}/`));
}

/** `/media`: the file library grid with upload, replace, alt text edit and delete; filters live in the URL. */
export function MediaLibraryPage() {
  const copy = useScreenText('media').media;
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(() => readQuery(searchParams), [searchParams]);
  const { page, pageSize, search, mimeType } = query;
  const media = useMediaQuery({ page, pageSize, search, mimeType });
  const api = useMediaApi();
  const queryClient = useQueryClient();
  const caller = useCallerAccess();
  const [editing, setEditing] = useState<MediaFile | null>(null);
  const [deleting, setDeleting] = useState<MediaFile | null>(null);
  const [replacing, setReplacing] = useState<MediaFile | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const { rememberOpener, restoreFocus } = useRestoreFocus(headingRef);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<readonly File[]>();

  const canCreate = caller.isReady && caller.can(MEDIA_SUBJECT, 'create');
  const canUpdate = caller.isReady && caller.can(MEDIA_SUBJECT, 'update');
  const canDelete = caller.isReady && caller.can(MEDIA_SUBJECT, 'delete');

  const showQuery = (next: LibraryQuery, options: { replace: boolean }) =>
    setSearchParams(writeQuery(next), options);
  const setPage = (next: number, options = { replace: false }) =>
    showQuery({ ...query, page: next }, options);

  const total = media.data?.meta.total;
  useEffect(() => {
    if (total === undefined) return;
    const lastPage = Math.max(FIRST_PAGE, Math.ceil(total / pageSize));
    if (page > lastPage) showQuery({ ...query, page: lastPage }, { replace: true });
  });

  const open = (opener: HTMLElement, next: () => void) => {
    rememberOpener(opener);
    setNotice(null);
    next();
  };

  const refreshLibrary = () => void queryClient.invalidateQueries({ queryKey: MEDIA_QUERY_KEY });

  const onUploaded = (files: MediaFile[]) => {
    refreshLibrary();
    if (page !== FIRST_PAGE) setPage(FIRST_PAGE);
    setNotice({ tone: 'success', message: copy.uploaded(files.length) });
  };

  const sendReplacement: SendFile = (file, onProgress, signal) =>
    api.replaceFile(replacing?.id ?? '', file, { onProgress, signal });

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    if (!canCreate || files.length === 0) return;
    setNotice(null);
    setDroppedFiles(files);
    setIsUploadOpen(true);
  };

  const rows = media.data?.data ?? [];
  const isFiltered = search !== '' || mimeType !== MEDIA_MIME_ALL;

  const loadError = media.isError ? (
    isForbidden(media.error) ? (
      <FormAlert tone="info">{copy.forbidden}</FormAlert>
    ) : (
      <LoadError
        message={copy.loadFailed}
        isRetrying={media.isFetching}
        onRetry={() => void media.refetch()}
      />
    )
  ) : undefined;

  return (
    <div ref={headingRef} className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title={copy.title} description={copy.description} />
      {notice === null ? null : <FormAlert tone={notice.tone}>{notice.message}</FormAlert>}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <MediaFilters
            value={{ search, mimeType, pageSize }}
            onChange={(next) => showQuery({ ...next, page: FIRST_PAGE }, { replace: false })}
          />
        </div>
        {canCreate ? (
          <Button
            type="button"
            variant="primary"
            onClick={(event) => {
              open(event.currentTarget, () => setIsUploadOpen(true));
            }}
          >
            {copy.upload}
          </Button>
        ) : null}
      </div>
      <div
        className="grid gap-4"
        onDragOver={(event) => {
          if (canCreate) event.preventDefault();
        }}
        onDrop={onDrop}
      >
        <MediaGrid
          mode="manage"
          files={rows}
          isLoading={media.isPending}
          error={loadError}
          emptyTitle={isFiltered ? copy.grid.noResults : copy.empty}
          emptyHint={
            isFiltered
              ? copy.grid.noResultsHint
              : canCreate
                ? copy.emptyHint
                : copy.emptyHintReadOnly
          }
          actions={{
            ...(canUpdate
              ? {
                  onEditAlt: (file: MediaFile, opener: HTMLElement) =>
                    open(opener, () => setEditing(file)),
                  onReplace: (file: MediaFile, opener: HTMLElement) =>
                    open(opener, () => setReplacing(file)),
                }
              : {}),
            ...(canDelete
              ? {
                  onDelete: (file: MediaFile, opener: HTMLElement) =>
                    open(opener, () => setDeleting(file)),
                }
              : {}),
          }}
        />
        {media.data === undefined || rows.length === 0 ? null : (
          <Pagination
            meta={media.data.meta}
            count={rows.length}
            onPage={(next) => setPage(next)}
            copy={copy.pagination}
          />
        )}
      </div>
      <UploadDialog
        mode="many"
        open={isUploadOpen}
        initialFiles={droppedFiles}
        onClose={() => {
          setIsUploadOpen(false);
          setDroppedFiles(undefined);
        }}
        onCloseAutoFocus={restoreFocus}
        onUploaded={onUploaded}
      />
      <UploadDialog
        mode="one"
        open={replacing !== null}
        accept={replacing === null ? MEDIA_ALLOWED_MIME_TYPES : replacementTypes(replacing)}
        send={sendReplacement}
        onClose={() => setReplacing(null)}
        onCloseAutoFocus={restoreFocus}
        onUploaded={(files) => {
          refreshLibrary();
          const [replaced] = files;
          if (replaced !== undefined) {
            setNotice({ tone: 'success', message: copy.replaced(replaced.fileName) });
          }
        }}
      />
      <EditAltDialog
        file={editing}
        onClose={() => setEditing(null)}
        onSaved={(file) => {
          setEditing(null);
          setNotice({
            tone: 'success',
            message: copy.altDialog.saved(file.fileName),
          });
        }}
        onGone={() => {
          setEditing(null);
          setNotice({ tone: 'info', message: copy.errors.gone });
        }}
        onCloseAutoFocus={restoreFocus}
      />
      <DeleteMediaDialog
        file={deleting}
        onClose={() => setDeleting(null)}
        onDone={(file, outcome) => {
          setDeleting(null);
          rememberOpener(null); // the file's card is gone, so focus goes to the heading
          setNotice(
            outcome === 'deleted'
              ? {
                  tone: 'success',
                  message: copy.deleteDialog.deleted(file.fileName),
                }
              : { tone: 'info', message: copy.errors.gone },
          );
        }}
        onCloseAutoFocus={restoreFocus}
      />
    </div>
  );
}
