import { useEffect, useId } from 'react';
import { Controller, useFormContext } from 'react-hook-form';

import { MediaInput } from '@repo/form-commons/components/forms/MediaInput';
import { useMediaSource } from '@repo/form-commons/hooks/use-media-source';
import { cn } from '@repo/form-commons/lib/cn';

import { useSchemaFormAnnounce, useSchemaFormReadOnly } from '@/components/form/schemaFormContext';
import { readMediaValue, resolveMedia } from '@/features/content/mediaValue';
import { CmsMediaProvider } from '@/features/settings/components/CmsMediaProvider';
import type { MediaAsset } from '@/features/settings/types';

export interface MediaFieldProps {
  label: string;
  name: string;
  className?: string;
}

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
  const { items } = useMediaSource<MediaAsset>();
  const labelId = useId();

  const current = readMediaValue(value);
  const resolved = resolveMedia(current, items);
  const resolvedAsset = resolved.status === 'found' ? resolved.asset : null;

  // A documentId the list resolves becomes the full asset, as the field's clean value, so a save
  // writes the MediaAsset (D4) without making the form dirty.
  useEffect(() => {
    if (typeof current === 'string' && resolvedAsset) {
      resetField(name, { defaultValue: resolvedAsset });
    }
  }, [current, resolvedAsset, name, resetField]);

  return (
    <div data-slot="field" className={cn('flex flex-col gap-1.5', className)}>
      <span id={labelId} className="text-sm leading-normal font-medium">
        {label}
      </span>
      <MediaInput<MediaAsset>
        aria-labelledby={labelId}
        value={current}
        onChange={onChange}
        onAnnounce={announce}
        readOnly={readOnly}
        config={{ label }}
      />
    </div>
  );
};
MediaControl.displayName = 'MediaControl';

/**
 * A `media` field (D4, AC-13, AC-28 to AC-31): the package `MediaInput` on the cms-admin media
 * library (`CmsMediaProvider`). Choose is gated by `media:read`; a value the list can't resolve
 * shows "File not found". The value is the full `MediaAsset`.
 */
export const MediaField: React.FC<MediaFieldProps> = ({ label, name, className }) => {
  const { control } = useFormContext();
  return (
    <CmsMediaProvider>
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
    </CmsMediaProvider>
  );
};
MediaField.displayName = 'MediaField';
