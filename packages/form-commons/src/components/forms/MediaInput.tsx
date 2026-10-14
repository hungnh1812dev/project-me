'use client';

import { useRef, useState } from 'react';
import { FileWarningIcon, ImageIcon, ImagePlusIcon, Trash2Icon } from 'lucide-react';

import { useMediaSource } from '../../hooks/use-media-source';
import { cn } from '../../lib/cn';
import type { InputProps, MediaInputConfig } from '../../lib/inputContract';
import { formatBytes, resolveMedia, type MediaFile, type MediaValue } from '../../lib/media';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { GatedButton } from './GatedButton';
import { MediaImage } from './MediaImage';
import { MediaPickerDialog } from './MediaPickerDialog';

export type MediaInputProps<T> = Omit<InputProps<MediaValue<T>, MediaInputConfig>, 'onChange'> & {
  /** The chosen asset, or `null` after Remove. A string value is never sent back unchanged. */
  onChange: (value: T | null) => void;
  /** Called with "<label> set to <file>." and "<label> removed.", for a live region. */
  onAnnounce?: (message: string) => void;
};

/** The centred icon and text of a state with no image: loading, empty or missing. */
const PreviewState: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({
  icon,
  children,
}) => (
  <div className="flex max-w-full min-w-0 flex-col items-center gap-2 px-4 text-center">
    {icon}
    {children}
  </div>
);
PreviewState.displayName = 'PreviewState';

type PreviewStatus =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'found'; file: MediaFile }
  | { status: 'missing'; id: string };

/**
 * The current value in a full-width, 320px box: the asset's full `url` with `contain`, or the
 * loading, empty or missing state. The box has a fixed height, so nothing moves while the image
 * loads.
 */
const MediaPreview: React.FC<{ preview: PreviewStatus }> = ({ preview }) => {
  const iconClass = 'size-8';
  let content: React.ReactNode;
  if (preview.status === 'loading')
    content = (
      <PreviewState
        icon={<ImageIcon aria-hidden="true" className={cn(iconClass, 'animate-pulse')} />}
      >
        <p>Loading file…</p>
      </PreviewState>
    );
  else if (preview.status === 'found') {
    const { file } = preview;
    content = (
      <MediaImage
        file={file}
        width={file.width ?? 320}
        height={file.height ?? 320}
        loading="lazy"
        fit="contain"
        source="url"
      />
    );
  } else if (preview.status === 'missing')
    content = (
      <PreviewState
        icon={<FileWarningIcon aria-hidden="true" className={cn(iconClass, 'text-destructive')} />}
      >
        <p className="text-destructive font-medium">File not found</p>
        <p className="max-w-full truncate text-xs" title={preview.id}>
          {preview.id}
        </p>
      </PreviewState>
    );
  else
    content = (
      <PreviewState icon={<ImageIcon aria-hidden="true" className={iconClass} />}>
        <p>No file selected.</p>
      </PreviewState>
    );

  return (
    <div
      data-slot="media-preview"
      className="bg-muted text-muted-foreground flex h-80 w-full items-center justify-center overflow-hidden rounded-md"
    >
      {content}
    </div>
  );
};
MediaPreview.displayName = 'MediaPreview';

/** A found asset's file name (truncated, full name in `title`), "W × H" and size, when known. */
const MediaMeta: React.FC<{ file: MediaFile }> = ({ file }) => {
  const details = [
    file.width !== undefined && file.height !== undefined ? `${file.width} × ${file.height}` : null,
    file.size !== undefined ? formatBytes(file.size) : null,
  ].filter((detail) => detail !== null);
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <p className="truncate font-medium" title={file.fileName}>
        {file.fileName}
      </p>
      {details.length > 0 && (
        <p className="text-muted-foreground text-xs">
          {details.map((detail, index) => (
            <span key={detail}>
              {index > 0 && <span aria-hidden="true"> · </span>}
              <span>{detail}</span>
            </span>
          ))}
        </p>
      )}
    </div>
  );
};
MediaMeta.displayName = 'MediaMeta';

/**
 * One media value from the nearest `MediaProvider`: a 320px preview, then the file name,
 * dimensions and size, with Choose (opens the picker, gated by `canBrowse`) and Remove. A string
 * value is an id resolved through the library; one it can't resolve shows "File not found".
 * `readOnly` hides the buttons; `disabled` keeps them inert. The group is named by
 * `aria-labelledby`, else by `config.label`.
 */
export const MediaInput = <T,>({
  value,
  onChange,
  onAnnounce,
  config,
  disabled = false,
  readOnly = false,
  id,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
}: MediaInputProps<T>) => {
  const source = useMediaSource<T>();
  const label = config?.label ?? 'File';
  const groupRef = useRef<HTMLDivElement>(null);
  const [picker, setPicker] = useState({ open: false, session: 0 });

  const resolved = resolveMedia(value, source.items, source.describe);
  const loading =
    resolved.status === 'missing' &&
    source.canBrowse.allowed &&
    source.items === undefined &&
    !source.error;
  const asset = resolved.status === 'found' ? resolved.asset : null;
  const file = asset === null ? null : source.describe(asset);
  const preview: PreviewStatus = loading
    ? { status: 'loading' }
    : file
      ? { status: 'found', file }
      : resolved.status === 'missing'
        ? { status: 'missing', id: resolved.id }
        : { status: 'empty' };

  const focusChoose = () =>
    groupRef.current?.querySelector<HTMLElement>('[data-action="choose"]')?.focus();

  return (
    <>
      <div
        ref={groupRef}
        id={id}
        role="group"
        aria-label={labelledBy ? undefined : (ariaLabel ?? label)}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        data-slot="media-input"
        className={cn(
          'border-input bg-background flex flex-col gap-2 rounded-md border p-2 text-sm',
          className,
        )}
      >
        <MediaPreview preview={preview} />
        {(file || !readOnly) && (
          <div className="flex min-h-9 items-center gap-3">
            {file ? <MediaMeta file={file} /> : <div className="flex-1" />}
            {!readOnly && (
              <div className="flex shrink-0 gap-2">
                <GatedButton
                  decision={source.canBrowse}
                  variant="outline"
                  size="icon"
                  data-action="choose"
                  aria-label={`Choose ${label}`}
                  tooltip={`Choose ${label}`}
                  disabled={disabled}
                  onClick={() =>
                    setPicker((previous) => ({ open: true, session: previous.session + 1 }))
                  }
                >
                  <ImagePlusIcon aria-hidden="true" />
                </GatedButton>
                {resolved.status !== 'empty' && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${label}`}
                          disabled={disabled}
                          onClick={() => {
                            onChange(null);
                            onAnnounce?.(`${label} removed.`);
                            focusChoose();
                          }}
                        />
                      }
                    >
                      <Trash2Icon aria-hidden="true" />
                    </TooltipTrigger>
                    <TooltipContent>{`Remove ${label}`}</TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {picker.session > 0 && (
        <MediaPickerDialog<T>
          key={picker.session}
          open={picker.open}
          onOpenChange={(open) => setPicker((previous) => ({ ...previous, open }))}
          label={label}
          selectedId={file?.id ?? null}
          onSelect={(chosen) => {
            onChange(chosen);
            onAnnounce?.(`${label} set to ${source.describe(chosen).fileName}.`);
          }}
        />
      )}
    </>
  );
};
MediaInput.displayName = 'MediaInput';
