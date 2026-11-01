import { useEffect, useRef, useState, type DragEvent } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormAlert,
  formatFileSize,
} from '@abyss/form-commons';
import { COPY } from '@configs/Copy.constants';
import { FileText, X } from 'lucide-react';

import type { MediaFile } from './Media.api';
import { MEDIA_ALLOWED_MIME_TYPES } from './Media.constants';
import { useMediaApi } from './MediaApi.context';
import type { UploadItem } from './UploadQueue.rules';
import { useUploadQueue, type SendFile } from './useUploadQueue';

const copy = COPY.media.uploadDialog;
const IMAGE_PREFIX = 'image/';
const PERCENT = 100;

function percentOf(sentBytes: number, totalBytes: number): number {
  return totalBytes === 0 ? 0 : Math.round((sentBytes / totalBytes) * PERCENT);
}

function ProgressBar({ label, percent }: { label: string; percent: number }) {
  return (
    <progress
      aria-label={label}
      max={PERCENT}
      value={percent}
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted accent-primary [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary"
    />
  );
}

/** The object URL lives as long as the row, so removing the row or closing the dialog revokes it. */
function Preview({ file }: { file: File }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const isImage = file.type.startsWith(IMAGE_PREFIX);
  useEffect(() => {
    const image = imageRef.current;
    if (!isImage || image === null) return undefined;
    const url = URL.createObjectURL(file);
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);
  return (
    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-muted text-muted-foreground">
      {isImage ? (
        <img ref={imageRef} alt={copy.previewAlt(file.name)} className="size-full object-cover" />
      ) : (
        <FileText aria-hidden className="size-5" />
      )}
    </span>
  );
}

function statusText(item: UploadItem): string {
  switch (item.status) {
    case 'uploading':
      return copy.status.uploading(percentOf(item.sentBytes, item.file.size));
    case 'processing':
      return copy.status.processing;
    case 'done':
      return copy.status.done;
    case 'failed':
      return item.error ?? copy.status.failed;
    case 'rejected':
      return item.rejection === undefined ? '' : copy.rejected[item.rejection];
    default:
      return copy.status.waiting;
  }
}

function UploadRow({
  item,
  canEdit,
  onRemove,
  onRetry,
}: {
  item: UploadItem;
  canEdit: boolean;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const isSending = item.status === 'uploading' || item.status === 'processing';
  const isProblem = item.status === 'failed' || item.status === 'rejected';
  const canRemove = canEdit && !isSending && item.status !== 'done';
  return (
    <li className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-0">
      <Preview file={item.file} />
      <div className="grid min-w-0 flex-1 gap-1">
        <span className="truncate text-sm font-medium">{item.file.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {formatFileSize(item.file.size)} · {item.file.type || '-'}
        </span>
        {item.status === 'rejected' ? null : (
          <ProgressBar
            label={item.file.name}
            percent={item.status === 'done' ? PERCENT : percentOf(item.sentBytes, item.file.size)}
          />
        )}
        <span
          className={`text-xs ${isProblem ? 'text-destructive' : 'text-muted-foreground'}`}
          role={isProblem ? 'alert' : undefined}
        >
          {statusText(item)}
        </span>
      </div>
      {item.status === 'failed' ? (
        <Button
          type="button"
          size="sm"
          aria-label={copy.retryLabel(item.file.name)}
          onClick={onRetry}
        >
          {copy.retry}
        </Button>
      ) : null}
      {canRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={copy.removeLabel(item.file.name)}
          onClick={onRemove}
        >
          <X aria-hidden className="size-4" />
        </Button>
      ) : null}
    </li>
  );
}

/** Hands the parent the files that reached the library and were not reported before. */
function reportNewlyUploaded(
  items: readonly UploadItem[],
  reportedIds: Set<string>,
  onUploaded: (files: MediaFile[]) => void,
) {
  const fresh = items.filter(
    (item) => item.status === 'done' && item.media && !reportedIds.has(item.id),
  );
  if (fresh.length === 0) return;
  for (const item of fresh) reportedIds.add(item.id);
  onUploaded(fresh.flatMap((item) => (item.media ? [item.media] : [])));
}

/**
 * Upload files after a confirmation list: preview, flag and drop the bad ones, send
 * a few at a time with progress. `onUploaded` gets the files that reached the library.
 */
export function UploadDialog({
  mode,
  accept = MEDIA_ALLOWED_MIME_TYPES,
  send,
  initialFiles,
  onUploaded,
  open,
  onClose,
  onCloseAutoFocus,
}: {
  mode: 'many' | 'one';
  accept?: readonly string[];
  send?: SendFile;
  /** Files dropped outside the dialog; each new array is added once when the dialog is open. */
  initialFiles?: readonly File[] | undefined;
  onUploaded: (files: MediaFile[]) => void;
  open: boolean;
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const api = useMediaApi();
  const defaultSend: SendFile = (file, onProgress, signal) =>
    api.upload(file, { onProgress, signal });
  const queue = useUploadQueue(send ?? defaultSend);
  const { items, totals, isBusy, hasWaiting } = queue;
  const [isStarted, setIsStarted] = useState(false);
  const [isConfirmingStop, setIsConfirmingStop] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const reportedIds = useRef(new Set<string>());
  const onUploadedRef = useRef(onUploaded);
  useEffect(() => {
    onUploadedRef.current = onUploaded;
  }, [onUploaded]);
  const fileInput = useRef<HTMLInputElement>(null);

  const isOne = mode === 'one';
  const accepted = items.filter((item) => item.status !== 'rejected');
  const hasFailed = items.some((item) => item.status === 'failed');
  const isFinished = isStarted && !isBusy && !hasWaiting;

  const reportUploaded = () => reportNewlyUploaded(items, reportedIds.current, onUploaded);

  const finishClose = () => {
    reportUploaded();
    queue.reset();
    reportedIds.current.clear();
    setIsStarted(false);
    setIsConfirmingStop(false);
    onClose();
  };

  const requestClose = () => {
    if (isBusy) setIsConfirmingStop(true);
    else finishClose();
  };

  // The library behind the dialog refreshes as soon as a batch settles.
  useEffect(() => {
    if (isFinished) reportNewlyUploaded(items, reportedIds.current, onUploadedRef.current);
  }, [isFinished, items]);

  const addFiles = (files: File[]) => {
    if (files.length === 0) return;
    if (isOne) {
      queue.reset();
      queue.add(files.slice(0, 1), accept);
    } else {
      queue.add(files, accept);
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    if (!isStarted) addFiles(Array.from(event.dataTransfer.files));
  };

  const addedInitialFiles = useRef<readonly File[] | undefined>(undefined);
  const addFilesRef = useRef(addFiles);
  useEffect(() => {
    addFilesRef.current = addFiles;
  });
  useEffect(() => {
    if (!open || initialFiles === undefined || addedInitialFiles.current === initialFiles) return;
    addedInitialFiles.current = initialFiles;
    addFilesRef.current([...initialFiles]);
  }, [open, initialFiles]);

  const showDropzone = !isStarted && (isOne ? accepted.length === 0 : true);
  const hasList = items.length > 0;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : requestClose())}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        {isConfirmingStop ? (
          <>
            <DialogHeader>
              <DialogTitle>{copy.confirmTitle}</DialogTitle>
              <DialogDescription>{copy.confirmDescription}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" onClick={() => setIsConfirmingStop(false)}>
                {copy.confirmKeep}
              </Button>
              <Button
                type="button"
                variant="warning"
                onClick={() => {
                  queue.abortAll();
                  finishClose();
                }}
              >
                {copy.confirmStop}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{isOne ? copy.titleOne : copy.title}</DialogTitle>
              <DialogDescription>{copy.description}</DialogDescription>
            </DialogHeader>
            {showDropzone ? (
              <div
                data-testid="upload-dropzone"
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                className={`grid justify-items-start gap-2 rounded-md border border-dashed p-4 ${
                  isDragging ? 'border-primary bg-muted' : 'border-border'
                }`}
              >
                <p className="m-0 text-sm font-medium">
                  {isOne ? copy.dropzoneOne : copy.dropzone}
                </p>
                <p className="m-0 text-xs text-muted-foreground">{copy.limits}</p>
                <Button type="button" onClick={() => fileInput.current?.click()}>
                  {hasList ? copy.addMore : isOne ? copy.chooseOne : copy.choose}
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  tabIndex={-1}
                  multiple={!isOne}
                  accept={accept.join(',')}
                  aria-label={isOne ? copy.chooseOne : copy.choose}
                  data-testid="upload-dialog-input"
                  onChange={(event) => {
                    const files = Array.from(event.currentTarget.files ?? []);
                    event.currentTarget.value = '';
                    addFiles(files);
                  }}
                />
              </div>
            ) : null}
            {hasList ? (
              <div className="grid gap-2">
                <ul
                  aria-label={copy.listLabel}
                  className="m-0 max-h-80 list-none overflow-y-auto rounded-md border border-border bg-card p-0"
                >
                  {items.map((item) => (
                    <UploadRow
                      key={item.id}
                      item={item}
                      canEdit={!isStarted || item.status === 'failed'}
                      onRemove={() => queue.remove(item.id)}
                      onRetry={() => queue.retry(item.id)}
                    />
                  ))}
                </ul>
                {isStarted ? (
                  <ProgressBar
                    label={copy.totalLabel}
                    percent={percentOf(totals.sentBytes, totals.totalBytes)}
                  />
                ) : (
                  <p className="m-0 text-xs text-muted-foreground">
                    {copy.summary(accepted.length)}
                  </p>
                )}
              </div>
            ) : null}
            {isFinished && hasFailed ? <FormAlert tone="error">{copy.someFailed}</FormAlert> : null}
            <DialogFooter>
              {isFinished ? (
                <Button type="button" variant="primary" onClick={requestClose}>
                  {copy.close}
                </Button>
              ) : (
                <>
                  <Button type="button" onClick={requestClose}>
                    {copy.cancel}
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    loading={isBusy}
                    disabled={isStarted || accepted.length === 0}
                    onClick={() => {
                      setIsStarted(true);
                      queue.start();
                    }}
                  >
                    {accepted.length > 1 ? copy.uploadCount(accepted.length) : copy.upload}
                  </Button>
                </>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
