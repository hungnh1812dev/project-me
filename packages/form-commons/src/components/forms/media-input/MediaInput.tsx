import * as React from 'react';
import { cn } from 'cn';
import { FolderOpen, ImagePlus, RefreshCw, X } from 'lucide-react';

import { Field } from '@/components/forms/field';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';

import { MediaDetails } from './MediaDetails';
import { MediaPreview } from './MediaPreview';

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
  /** Hex digest; its first characters tell same-named files apart. */
  sha256?: string | undefined;
  /** ISO 8601; shown in place of `createdAt` when present. */
  updatedAt?: string | undefined;
  /** Pixels; known for images and videos only. */
  width?: number | null | undefined;
  height?: number | null | undefined;
}

export interface MediaInputLabels {
  empty: string;
  choose: string;
  upload: string;
  replace: string;
  remove: string;
  delete: string;
  /** Overlay action that picks a new file from disk; defaults to `replace`. */
  replaceFile?: string | undefined;
  /** Overlay action that detaches the file from the field; defaults to `remove`. */
  removeFromField?: string | undefined;
  /** Badge on a video preview. */
  videoBadge?: string | undefined;
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
  /** Replace the attached file; the parent opens its own picker. Falls back to the file input of `onFilePick`. */
  onReplace?: (() => void) | undefined;
  /** Start an upload (e.g. open the upload dialog); falls back to the file input of `onFilePick`. */
  onUpload?: (() => void) | undefined;
  /** Detach the file from this field (the file stays in the library). */
  onRemove?: (() => void) | undefined;
  /** Delete the file from the library. */
  onDelete?: (() => void) | undefined;
  /** Open the library to pick another file. */
  onOpenLibrary?: (() => void) | undefined;
}

const DEFAULT_VIDEO_BADGE = 'Video';

/**
 * The attached library file as a large preview with overlay actions and a
 * details footer, or an empty drop area. Presentational: the owner holds the value.
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
  onReplace,
  onUpload,
  onRemove,
  onDelete,
  onOpenLibrary,
}: MediaInputProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const handleFilePick = onFilePick ?? onChange;
  const openFileInput = () => fileInputRef.current?.click();
  const startReplace = onReplace ?? (handleFilePick === undefined ? undefined : openFileInput);
  const startUpload = onUpload ?? (handleFilePick === undefined ? undefined : openFileInput);

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
          className="m-0 grid min-w-0 gap-3 border-0 p-0"
        >
          <legend className="sr-only">{label}</legend>
          {value === null ? (
            <div
              data-slot="media-empty"
              className="border-input bg-card flex h-(--size-media-preview) w-full flex-col items-center justify-center gap-4 rounded-md border border-dashed p-4"
            >
              <p className="text-muted-foreground m-0 text-sm">{labels.empty}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {startUpload === undefined ? null : (
                  <Button type="button" size="sm" disabled={disabled} onClick={startUpload}>
                    <ImagePlus aria-hidden="true" />
                    {labels.upload}
                  </Button>
                )}
                {onOpenLibrary === undefined ? null : (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={disabled}
                    onClick={onOpenLibrary}
                  >
                    <FolderOpen aria-hidden="true" />
                    {labels.choose}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div
              data-slot="media-frame"
              className={cn(
                'border-border bg-card grid min-w-0 gap-3 rounded-md border p-3',
                error !== undefined && 'border-destructive',
              )}
            >
              <MediaPreview
                file={value}
                height="field"
                labels={{
                  previewFallback: labels.previewFallback,
                  videoBadge: labels.videoBadge ?? DEFAULT_VIDEO_BADGE,
                }}
                actions={
                  <>
                    {startReplace === undefined ? null : (
                      <IconButton
                        type="button"
                        variant="ghost"
                        label={labels.replaceFile ?? labels.replace}
                        disabled={disabled}
                        onClick={startReplace}
                      >
                        <RefreshCw aria-hidden="true" />
                      </IconButton>
                    )}
                    {onOpenLibrary === undefined ? null : (
                      <IconButton
                        type="button"
                        variant="ghost"
                        label={labels.choose}
                        disabled={disabled}
                        onClick={onOpenLibrary}
                      >
                        <FolderOpen aria-hidden="true" />
                      </IconButton>
                    )}
                    {onRemove === undefined ? null : (
                      <IconButton
                        type="button"
                        variant="ghost"
                        label={labels.removeFromField ?? labels.remove}
                        disabled={disabled}
                        onClick={onRemove}
                      >
                        <X aria-hidden="true" />
                      </IconButton>
                    )}
                  </>
                }
              />
              <div className="flex items-start justify-between gap-3">
                <MediaDetails file={value} />
                {onDelete === undefined ? null : (
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
            </div>
          )}
          {handleFilePick === undefined ? null : (
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
          )}
        </fieldset>
      )}
    </Field>
  );
}

export { MediaInput };
