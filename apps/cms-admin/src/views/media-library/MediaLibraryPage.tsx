import { useRef, useState } from 'react';
import { Button, FormAlert, SortableSheet, type FormAlertTone } from '@abyss/form-commons';
import { LoadError, PageHeader, TableSkeleton } from '@components/PageStates';
import { Pagination } from '@components/Pagination';
import { useClampedPage } from '@components/useClampedPage';
import { useRestoreFocus } from '@components/useRestoreFocus';
import { COPY } from '@configs/Copy.constants';
import { isForbidden, useCallerAccess } from '@features/access';
import type { MediaFile } from '@features/media/Media.api';
import { MEDIA_SUBJECT } from '@features/media/Media.constants';
import { MEDIA_QUERY_KEY, useMediaQuery } from '@features/media/Media.queries';
import { UploadDialog } from '@features/media/UploadDialog';
import { useQueryClient } from '@tanstack/react-query';

import { DeleteMediaDialog } from './DeleteMediaDialog';
import { EditAltDialog } from './EditAltDialog';
import { mediaColumns } from './Media.columns';

const copy = COPY.media;

interface Notice {
  tone: FormAlertTone;
  message: string;
}

/** `/media`: the file library with upload, alt text edit and delete. */
export function MediaLibraryPage() {
  const [page, setPage] = useState(1);
  const media = useMediaQuery(page);
  const queryClient = useQueryClient();
  const caller = useCallerAccess();
  const [editing, setEditing] = useState<MediaFile | null>(null);
  const [deleting, setDeleting] = useState<MediaFile | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const { rememberOpener, restoreFocus } = useRestoreFocus(headingRef);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const canCreate = caller.isReady && caller.can(MEDIA_SUBJECT, 'create');
  const canUpdate = caller.isReady && caller.can(MEDIA_SUBJECT, 'update');
  const canDelete = caller.isReady && caller.can(MEDIA_SUBJECT, 'delete');

  useClampedPage(page, setPage, media.data?.meta);

  const open = (opener: HTMLElement, next: () => void) => {
    rememberOpener(opener);
    setNotice(null);
    next();
  };

  const onUploaded = (files: MediaFile[]) => {
    void queryClient.invalidateQueries({ queryKey: MEDIA_QUERY_KEY });
    setPage(1);
    setNotice({ tone: 'success', message: copy.uploaded(files.length) });
  };

  const rows = media.data?.data ?? [];
  const columns = mediaColumns({
    canUpdate,
    canDelete,
    onEditAlt: (file, opener) => open(opener, () => setEditing(file)),
    onDelete: (file, opener) => open(opener, () => setDeleting(file)),
  });

  return (
    <div ref={headingRef} className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        action={
          canCreate ? (
            <Button
              type="button"
              variant="primary"
              onClick={(event) => {
                open(event.currentTarget, () => setIsUploadOpen(true));
              }}
            >
              {copy.upload}
            </Button>
          ) : null
        }
      />
      {notice === null ? null : <FormAlert tone={notice.tone}>{notice.message}</FormAlert>}
      {media.isPending ? (
        <TableSkeleton label={copy.loading} />
      ) : media.isError ? (
        isForbidden(media.error) ? (
          <FormAlert tone="info">{copy.forbidden}</FormAlert>
        ) : (
          <LoadError
            message={copy.loadFailed}
            isRetrying={media.isFetching}
            onRetry={() => void media.refetch()}
          />
        )
      ) : rows.length === 0 ? (
        <div className="grid justify-items-start gap-1">
          <p className="m-0 font-medium">{copy.empty}</p>
          <p className="m-0 text-sm text-muted-foreground">
            {canCreate ? copy.emptyHint : copy.emptyHintReadOnly}
          </p>
        </div>
      ) : (
        <div className="relative overflow-x-auto rounded-md border border-border bg-card">
          <SortableSheet
            className="rounded-none border-0"
            caption={copy.tableLabel}
            columns={columns}
            rows={rows}
            getRowId={(file) => file.id}
            getRowLabel={(file) => file.fileName}
          />
          {media.data === undefined ? null : (
            <Pagination
              meta={media.data.meta}
              count={rows.length}
              onPage={setPage}
              copy={copy.pagination}
            />
          )}
        </div>
      )}
      <UploadDialog
        mode="many"
        open={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onCloseAutoFocus={restoreFocus}
        onUploaded={onUploaded}
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
          rememberOpener(null); // the file's row is gone, so focus goes to the heading
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
