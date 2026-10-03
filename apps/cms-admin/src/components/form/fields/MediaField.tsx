import { useEffect, useId, useRef, useState } from 'react';
import { FileWarningIcon, ImageIcon } from 'lucide-react';
import { Controller, useFormContext } from 'react-hook-form';

import { Button } from '@repo/ui/components/button';
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

/** The thumbnail and text of the current value: the asset, "File not found" or nothing. */
const MediaPreview: React.FC<PreviewProps> = ({ resolved, loading }) => {
  const box =
    'flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted';
  if (loading)
    return (
      <>
        <span className={cn(box, 'animate-pulse')} aria-hidden="true" />
        <p className="min-w-0 flex-1 text-muted-foreground">Loading file…</p>
      </>
    );
  if (resolved.status === 'found') {
    const { asset } = resolved;
    return (
      <>
        <span className={box}>
          <MediaThumbnail asset={asset} width={64} height={64} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate font-medium" title={asset.fileName}>
            {asset.fileName}
          </p>
          <p className="text-xs text-muted-foreground">{formatBytes(asset.size)}</p>
        </div>
      </>
    );
  }
  if (resolved.status === 'missing')
    return (
      <>
        <span className={cn(box, 'text-destructive')}>
          <FileWarningIcon aria-hidden="true" className="size-6" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="font-medium text-destructive">File not found</p>
          <p className="truncate text-xs text-muted-foreground" title={resolved.id}>
            {resolved.id}
          </p>
        </div>
      </>
    );
  return (
    <>
      <span className={cn(box, 'text-muted-foreground')}>
        <ImageIcon aria-hidden="true" className="size-6" />
      </span>
      <p className="min-w-0 flex-1 text-muted-foreground">No file selected.</p>
    </>
  );
};
MediaPreview.displayName = 'MediaPreview';

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
        className="flex flex-wrap items-center gap-3 rounded-md border border-input bg-background p-2 text-sm"
      >
        <MediaPreview resolved={resolved} loading={loading} />
        {!readOnly && (
          <div className="flex gap-2">
            <GatedButton
              decision={media.decision}
              variant="outline"
              size="sm"
              data-action="choose"
              aria-label={`Choose ${label}`}
              onClick={() =>
                setPicker((previous) => ({ open: true, session: previous.session + 1 }))
              }
            >
              Choose
            </GatedButton>
            {current !== null && (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove ${label}`}
                onClick={() => {
                  onChange(null);
                  announce(`${label} removed.`);
                  focusChoose();
                }}
              >
                Remove
              </Button>
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
 * A `media` field (D4, AC-13): the current asset (thumbnail, name and size) with Choose, which
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
