import {
  Button,
  formatFileSize,
  FormAlert,
  type FormAlertTone,
} from '@abyss/form-commons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { useClampedPage } from '../../components/use-clamped-page';
import { useRestoreFocus } from '../../components/use-restore-focus';
import { formatDate } from '../../lib/date-format';

import { COPY } from '../../config/copy.constants';
import { MEDIA_ACCEPT, MEDIA_SUBJECT } from '../../config/media.constants';
import { isForbidden, useCallerAccess } from '../access';
import {
  LoadError,
  PageHeader,
  TableSkeleton,
} from '../../components/PageStates';
import { Pagination } from '../../components/Pagination';
import { DeleteMediaDialog } from './DeleteMediaDialog';
import { EditAltDialog } from './EditAltDialog';
import { useMediaApi } from './media-api-context';
import { toMediaError } from './media-error';
import { MEDIA_QUERY_KEY, useMediaQuery } from './media-queries';
import type { MediaFile } from './media.api';

const copy = COPY.media;
const IMAGE_PREFIX = 'image/';

interface Notice {
  tone: FormAlertTone;
  message: string;
}

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

/** `/media` (T29): the file library with upload, alt text edit and delete. */
export function MediaLibraryPage() {
  const [page, setPage] = useState(1);
  const media = useMediaQuery(page);
  const api = useMediaApi();
  const queryClient = useQueryClient();
  const caller = useCallerAccess();
  const [editing, setEditing] = useState<MediaFile | null>(null);
  const [deleting, setDeleting] = useState<MediaFile | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const { rememberOpener, restoreFocus } = useRestoreFocus(headingRef);
  const fileInput = useRef<HTMLInputElement>(null);

  const canCreate = caller.ready && caller.can(MEDIA_SUBJECT, 'create');
  const canUpdate = caller.ready && caller.can(MEDIA_SUBJECT, 'update');
  const canDelete = caller.ready && caller.can(MEDIA_SUBJECT, 'delete');
  const showActions = canUpdate || canDelete;

  useClampedPage(page, setPage, media.data?.meta);

  const open = (event: { currentTarget: HTMLElement }, next: () => void) => {
    rememberOpener(event.currentTarget);
    setNotice(null);
    next();
  };

  const upload = useMutation({
    mutationFn: (file: File) => api.upload(file),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: MEDIA_QUERY_KEY });
      setPage(1);
      setNotice({ tone: 'success', message: copy.uploaded(created.fileName) });
    },
    onError: (cause) =>
      setNotice({ tone: 'error', message: toMediaError(cause).message }),
  });

  const rows = media.data?.data ?? [];

  return (
    <div ref={headingRef} className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        action={
          canCreate ? (
            <>
              <Button
                type="button"
                variant="primary"
                loading={upload.isPending}
                onClick={() => {
                  setNotice(null);
                  fileInput.current?.click();
                }}
              >
                {copy.upload}
              </Button>
              <input
                ref={fileInput}
                type="file"
                hidden
                tabIndex={-1}
                accept={MEDIA_ACCEPT}
                aria-label={copy.upload}
                data-testid="media-upload-input"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  if (file !== undefined) upload.mutate(file);
                }}
              />
            </>
          ) : null
        }
      />
      {upload.isPending && upload.variables !== undefined ? (
        <FormAlert tone="info">
          {copy.uploading(upload.variables.name)}
        </FormAlert>
      ) : notice === null ? null : (
        <FormAlert tone={notice.tone}>{notice.message}</FormAlert>
      )}
      {media.isPending ? (
        <TableSkeleton label={copy.loading} />
      ) : media.isError ? (
        isForbidden(media.error) ? (
          <FormAlert tone="info">{copy.forbidden}</FormAlert>
        ) : (
          <LoadError
            message={copy.loadFailed}
            retrying={media.isFetching}
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
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{copy.tableLabel}</caption>
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {copy.columns.file}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {copy.columns.alt}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {copy.columns.size}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {copy.columns.added}
                </th>
                {showActions ? (
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    <span className="sr-only">{copy.columns.actions}</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((file) => (
                <tr key={file.id} className="border-t border-border">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <span className="flex items-center gap-3">
                      <Thumbnail file={file} />
                      <span className="min-w-0 truncate font-medium">
                        {file.fileName}
                      </span>
                    </span>
                  </th>
                  <td
                    className="max-w-64 px-3 py-2 text-muted-foreground"
                    title={file.alt ?? undefined}
                  >
                    <span className="line-clamp-2">
                      {file.alt ?? copy.noAlt}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatFileSize(file.size)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {formatDate(file.createdAt)}
                  </td>
                  {showActions ? (
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {canUpdate ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={copy.editAltLabel(file.fileName)}
                          onClick={(event) =>
                            open(event, () => setEditing(file))
                          }
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
                          onClick={(event) =>
                            open(event, () => setDeleting(file))
                          }
                        >
                          {copy.deleteAction}
                        </Button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
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
