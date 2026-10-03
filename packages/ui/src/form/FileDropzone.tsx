'use client';

import { useRef, useState } from 'react';
import {
  CheckCircle2Icon,
  CircleDashedIcon,
  Loader2Icon,
  UploadIcon,
  XCircleIcon,
} from 'lucide-react';

import { cn } from '../lib/cn';
import type { Decision } from '../lib/decision';
import { GatedButton } from './GatedButton';

/** One file of a batch and where it stands. */
export interface FileStatusItem {
  key: string;
  name: string;
  status: 'waiting' | 'uploading' | 'uploaded' | 'failed';
  /** Why it failed. */
  error?: string;
}

export interface FileDropzoneProps {
  /** From `useCan`. A denial keeps the button visible but inert and ignores drops (D5). */
  decision: Decision;
  /** The file input's `accept` list. */
  accept: string;
  /** Shown beside the button, for example "or drop PNG or JPEG images here". */
  hint: string;
  /** Receives the picked or dropped files, never an empty list. */
  onFiles: (files: File[]) => void;
  /** The current batch, listed under the zone. */
  items: readonly FileStatusItem[];
  /** The end-of-batch summary, shown under the list. The page announces it. */
  summary?: string;
  /** A batch is running: the button shows `loading` and new files are ignored. */
  busy?: boolean;
  label?: string;
}

const STATUS: Record<FileStatusItem['status'], { label: string; icon: React.ReactNode }> = {
  waiting: {
    label: 'Waiting',
    icon: <CircleDashedIcon aria-hidden="true" className="text-muted-foreground size-4" />,
  },
  uploading: {
    label: 'Uploading',
    icon: <Loader2Icon aria-hidden="true" className="text-muted-foreground size-4 animate-spin" />,
  },
  uploaded: {
    label: 'Uploaded',
    icon: <CheckCircle2Icon aria-hidden="true" className="text-primary size-4" />,
  },
  failed: {
    label: 'Failed',
    icon: <XCircleIcon aria-hidden="true" className="text-destructive size-4" />,
  },
};

/**
 * File picking for uploads (AC-36, AC-37). A visible **Upload** button opens a hidden
 * `multiple` file input, so the keyboard alone is enough; dropping files on the zone is an
 * enhancement. Under it, each file of the batch is listed with its status in text (Waiting,
 * Uploading, Uploaded, Failed with the reason), never by colour only.
 */
export const FileDropzone: React.FC<FileDropzoneProps> = ({
  decision,
  accept,
  hint,
  onFiles,
  items,
  summary,
  busy = false,
  label = 'Upload',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const enabled = decision.allowed && !busy;

  const take = (files: FileList | null | undefined) => {
    const list = Array.from(files ?? []);
    if (enabled && list.length > 0) onFiles(list);
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        data-testid="file-dropzone"
        data-dragging={dragging || undefined}
        onDragOver={(event) => {
          if (!enabled) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          take(event.dataTransfer?.files);
        }}
        className={cn(
          'flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-4 text-sm transition-colors',
          dragging && 'border-primary bg-accent',
        )}
      >
        <GatedButton decision={decision} loading={busy} onClick={() => inputRef.current?.click()}>
          <UploadIcon aria-hidden="true" />
          {label}
        </GatedButton>
        <span className="text-muted-foreground">{hint}</span>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          hidden
          tabIndex={-1}
          onChange={(event) => {
            take(event.target.files);
            event.target.value = '';
          }}
        />
      </div>
      {items.length > 0 && (
        <div className="flex flex-col gap-2 text-sm">
          <ul aria-label="Upload progress" className="flex flex-col gap-1.5">
            {items.map((item) => (
              <li key={item.key} className="flex min-w-0 items-start gap-2">
                <span className="mt-0.5 shrink-0">{STATUS[item.status].icon}</span>
                <span className="max-w-1/2 shrink-0 truncate font-medium" title={item.name}>
                  {item.name}
                </span>
                <span
                  className={cn(
                    'min-w-0 break-words',
                    item.status === 'failed' ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {STATUS[item.status].label}
                  {item.error && `: ${item.error}`}
                </span>
              </li>
            ))}
          </ul>
          {summary && <p className="font-medium">{summary}</p>}
        </div>
      )}
    </div>
  );
};
FileDropzone.displayName = 'FileDropzone';
