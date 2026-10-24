import * as React from 'react';
import { cn } from 'cn';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/forms/Field';

/** A library file as the field shows it. */
export interface MediaInputFile {
  id: string;
  fileName: string;
  /** Absent on files embedded in documents; the preview then needs a thumbnail. */
  mimeType?: string | undefined;
  /** Bytes. */
  size: number;
  url: string;
  thumbnailUrl: string | null;
  alt: string | null;
  /** Storage provider name; the badge is hidden when absent. */
  provider?: string | undefined;
  /** ISO 8601. */
  createdAt: string;
}

export interface MediaInputLabels {
  empty: string;
  choose: string;
  upload: string;
  replace: string;
  remove: string;
  delete: string;
  /** Alt text of the preview image when the file has none. */
  previewFallback: (fileName: string) => string;
}

export interface MediaInputProps {
  label: React.ReactNode;
  labels: MediaInputLabels;
  /** The attached file, or null for none. */
  value: MediaInputFile | null;
  description?: React.ReactNode | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
  disabled?: boolean | undefined;
  id?: string | undefined;
  className?: string | undefined;
  /** A file picked from the disk; the parent uploads it and sets `value`. */
  onFilePick?: ((file: File) => void) | undefined;
  /** @deprecated Use `onFilePick`; this is not a change event, it starts an upload. */
  onChange?: ((file: File) => void) | undefined;
  /** Detach the file from this field (the file stays in the library). */
  onRemove?: (() => void) | undefined;
  /** Delete the file from the library. */
  onDelete?: (() => void) | undefined;
  /** Open the library to pick another file. */
  onOpenLibrary?: (() => void) | undefined;
}

const BYTES_PER_UNIT = 1024;
const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;
const IMAGE_PREFIX = 'image/';

/** `1536` -> `1.5 KB`. */
export function formatFileSize(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= BYTES_PER_UNIT && unit < SIZE_UNITS.length - 1) {
    value /= BYTES_PER_UNIT;
    unit += 1;
  }
  const rounded = unit === 0 ? value : Math.round(value * 10) / 10;
  return `${rounded} ${SIZE_UNITS[unit]}`;
}

/** `jpeg`-style tag for a file without preview: from the type, else the extension. */
function fileKind(file: MediaInputFile): string {
  const fromType = file.mimeType?.split('/')[1];
  if (fromType !== undefined && fromType !== '') return fromType;
  const extensionDotIndex = file.fileName.lastIndexOf('.');
  return extensionDotIndex === -1
    ? ''
    : file.fileName.slice(extensionDotIndex + 1);
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

/**
 * Shows the attached library file (preview, name, size, provider, date) with
 * the actions around it. Presentational: the owner holds the value.
 */
function MediaInput({
  label,
  labels,
  value,
  description,
  error,
  required,
  disabled = false,
  id,
  className,
  onFilePick,
  onChange,
  onRemove,
  onDelete,
  onOpenLibrary,
}: MediaInputProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const handleFilePick = onFilePick ?? onChange;
  const preview =
    value === null
      ? null
      : (value.thumbnailUrl ??
        (value.mimeType?.startsWith(IMAGE_PREFIX) === true ? value.url : null));

  return (
    <Field
      label={label}
      description={description}
      error={error}
      required={required}
      className={className}
      id={id}
    >
      {(control) => (
        <fieldset
          id={control.id}
          aria-describedby={control['aria-describedby']}
          className="m-0 grid min-w-0 gap-3 rounded-md border border-input bg-card p-3"
        >
          <legend className="sr-only">{label}</legend>
          {value === null ? (
            <p className="m-0 text-sm text-muted-foreground">{labels.empty}</p>
          ) : (
            <div className="flex items-start gap-3">
              <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-muted">
                {preview === null ? (
                  <span className="text-xs font-medium uppercase text-muted-foreground">
                    {fileKind(value)}
                  </span>
                ) : (
                  <img
                    src={preview}
                    alt={value.alt ?? labels.previewFallback(value.fileName)}
                    className="size-full object-cover"
                  />
                )}
              </div>
              <div className="grid min-w-0 gap-1">
                <p className="m-0 truncate text-sm font-medium">
                  {value.fileName}
                </p>
                <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {formatFileSize(value.size)}
                  </span>
                  {value.provider === undefined ? null : (
                    <span
                      data-slot="media-provider"
                      className="rounded-sm bg-muted px-1.5 py-0.5 font-medium"
                    >
                      {value.provider}
                    </span>
                  )}
                  <time dateTime={value.createdAt} className="tabular-nums">
                    {dateFormat.format(new Date(value.createdAt))}
                  </time>
                </p>
              </div>
            </div>
          )}
          <div className={cn('flex flex-wrap gap-2')}>
            {onOpenLibrary === undefined ? null : (
              <Button
                type="button"
                size="sm"
                disabled={disabled}
                onClick={onOpenLibrary}
              >
                {value === null ? labels.choose : labels.replace}
              </Button>
            )}
            {handleFilePick === undefined ? null : (
              <>
                <Button
                  type="button"
                  size="sm"
                  disabled={disabled}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {labels.upload}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  tabIndex={-1}
                  data-testid="media-file-input"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = '';
                    if (file !== undefined) handleFilePick(file);
                  }}
                />
              </>
            )}
            {value === null || onRemove === undefined ? null : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={onRemove}
              >
                {labels.remove}
              </Button>
            )}
            {value === null || onDelete === undefined ? null : (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={disabled}
                onClick={onDelete}
              >
                {labels.delete}
              </Button>
            )}
          </div>
        </fieldset>
      )}
    </Field>
  );
}

export { MediaInput };
