import { useEffect, useId, useRef, useState } from 'react';
import { FileWarningIcon, ImageIcon, ImagePlusIcon, Trash2Icon } from 'lucide-react';
import { Controller, useFormContext } from 'react-hook-form';

import { Button } from '@repo/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@repo/ui/components/tooltip';
import { GatedButton } from '@repo/ui/form/GatedButton';
import { cn } from '@repo/ui/lib/cn';

import { useSchemaFormAnnounce, useSchemaFormReadOnly } from '@/components/form/schemaFormContext';
import { readMediaValue, resolveMedia, type ResolvedMedia } from '@/features/content/mediaValue';
import { useMediaList } from '@/features/settings/hooks/useMedia';
import { formatBytes } from '@/features/settings/media';
import type { MediaAsset } from '@/features/settings/types';
import { MediaThumbnail } from '@/pages/settings/media/MediaThumbnail';

import { MediaPickerDialog } from './MediaPickerDialog';

export interface MediaFieldProps {
  label: string;
  name: string;
  className?: string;
}

interface PreviewProps {
  resolved: ResolvedMedia;
  loading: boolean;
}

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

/**
 * The current value in a full-width, 320px box (AC-28 to AC-30): the asset's full `url` with
 * `contain`, or the loading, empty or missing state. The box has a fixed height, so nothing moves
 * while the image loads.
 */
const MediaPreview: React.FC<PreviewProps> = ({ resolved, loading }) => {
  const iconClass = 'size-8';
  let content: React.ReactNode;
  if (loading)
    content = (
      <PreviewState
        icon={<ImageIcon aria-hidden="true" className={cn(iconClass, 'animate-pulse')} />}
      >
        <p>Loading file…</p>
      </PreviewState>
    );
  else if (resolved.status === 'found') {
    const { asset } = resolved;
    content = (
      <MediaThumbnail
        asset={asset}
        width={asset.width}
        height={asset.height}
        loading="lazy"
        fit="contain"
        source="url"
      />
    );
  } else if (resolved.status === 'missing')
    content = (
      <PreviewState
        icon={<FileWarningIcon aria-hidden="true" className={cn(iconClass, 'text-destructive')} />}
      >
        <p className="font-medium text-destructive">File not found</p>
        <p className="max-w-full truncate text-xs" title={resolved.id}>
          {resolved.id}
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
      className="flex h-80 w-full items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground"
    >
      {content}
    </div>
  );
};
MediaPreview.displayName = 'MediaPreview';

/** A found asset's file name (truncated, full name in `title`), "W × H" and size (AC-30). */
const MediaMeta: React.FC<{ asset: MediaAsset }> = ({ asset }) => (
  <div className="flex min-w-0 flex-1 flex-col">
    <p className="truncate font-medium" title={asset.fileName}>
      {asset.fileName}
    </p>
    <p className="text-xs text-muted-foreground">
      <span>{`${asset.width} × ${asset.height}`}</span>
      <span aria-hidden="true"> · </span>
      <span>{formatBytes(asset.size)}</span>
    </p>
  </div>
);
MediaMeta.displayName = 'MediaMeta';

interface ControlProps {
  label: string;
  name: string;
  value: unknown;
  onChange: (value: MediaAsset | null) => void;
  className?: string;
}

const MediaControl: React.FC<ControlProps> = ({ label, name, value, onChange, className }) => {
  const { resetField } = useFormContext();
  const readOnly = useSchemaFormReadOnly();
  const announce = useSchemaFormAnnounce();
  const media = useMediaList();
  const labelId = useId();
  const groupRef = useRef<HTMLDivElement>(null);
  const [picker, setPicker] = useState({ open: false, session: 0 });

  const current = readMediaValue(value);
  const resolved = resolveMedia(current, media.data);
  const loading = typeof current === 'string' && media.decision.allowed && media.isPending;
  const resolvedAsset = resolved.status === 'found' ? resolved.asset : null;

  // A documentId the list resolves becomes the full asset, as the field's clean value, so a save
  // writes the MediaAsset (D4) without making the form dirty.
  useEffect(() => {
    if (typeof current === 'string' && resolvedAsset) {
      resetField(name, { defaultValue: resolvedAsset });
    }
  }, [current, resolvedAsset, name, resetField]);

  const focusChoose = () =>
    groupRef.current?.querySelector<HTMLElement>('[data-action="choose"]')?.focus();

  return (
    <div data-slot="field" className={cn('flex flex-col gap-1.5', className)}>
      <span id={labelId} className="text-sm leading-normal font-medium">
        {label}
      </span>
      <div
        ref={groupRef}
        role="group"
        aria-labelledby={labelId}
        className="flex flex-col gap-2 rounded-md border border-input bg-background p-2 text-sm"
      >
        <MediaPreview resolved={resolved} loading={loading} />
        {(resolvedAsset || !readOnly) && (
          <div className="flex min-h-9 items-center gap-3">
            {resolvedAsset ? <MediaMeta asset={resolvedAsset} /> : <div className="flex-1" />}
            {!readOnly && (
              <div className="flex shrink-0 gap-2">
                <GatedButton
                  decision={media.decision}
                  variant="outline"
                  size="icon"
                  data-action="choose"
                  aria-label={`Choose ${label}`}
                  tooltip={`Choose ${label}`}
                  onClick={() =>
                    setPicker((previous) => ({ open: true, session: previous.session + 1 }))
                  }
                >
                  <ImagePlusIcon aria-hidden="true" />
                </GatedButton>
                {current !== null && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${label}`}
                          onClick={() => {
                            onChange(null);
                            announce(`${label} removed.`);
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
        <MediaPickerDialog
          key={picker.session}
          open={picker.open}
          onOpenChange={(open) => setPicker((previous) => ({ ...previous, open }))}
          label={label}
          selectedId={resolvedAsset?.documentId ?? null}
          onSelect={(asset) => {
            onChange(asset);
            announce(`${label} set to ${asset.fileName}.`);
          }}
        />
      )}
    </div>
  );
};
MediaControl.displayName = 'MediaControl';

/**
 * A `media` field (D4, AC-13, AC-28 to AC-31): the current asset (a 320px preview, then name,
 * dimensions and size) with Choose, which
 * opens `MediaPickerDialog`, and Remove. Choose is gated by `media:read`; a value the list can't
 * resolve shows "File not found". The value is the full `MediaAsset`.
 */
export const MediaField: React.FC<MediaFieldProps> = ({ label, name, className }) => {
  const { control } = useFormContext();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <MediaControl
          label={label}
          name={name}
          value={field.value}
          onChange={field.onChange}
          className={className}
        />
      )}
    />
  );
};
MediaField.displayName = 'MediaField';
