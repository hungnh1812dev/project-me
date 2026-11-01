import { useState } from 'react';
import { MediaInput } from '@abyss/form-commons';
import { COPY } from '@configs/Copy.constants';
import { useQueryClient } from '@tanstack/react-query';
import { useController } from 'react-hook-form';

import { useCallerAccess } from '../access';
import { MEDIA_SUBJECT } from './Media.constants';
import { MEDIA_QUERY_KEY } from './Media.queries';
import { libraryFileToInput, mediaToForm } from './MediaFieldValue.rules';
import { MediaPickerDialog } from './MediaPickerDialog';
import { UploadDialog } from './UploadDialog';

const copy = COPY.media;

/** A `media` field of the dynamic form: upload, pick from the library, or detach. */
export function MediaField({ name, label }: { name: string; label: string }) {
  const { field, fieldState } = useController({ name });
  const queryClient = useQueryClient();
  const caller = useCallerAccess();
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);

  const canRead = caller.isReady && caller.can(MEDIA_SUBJECT, 'read');
  const canCreate = caller.isReady && caller.can(MEDIA_SUBJECT, 'create');
  const openUpload = canCreate ? () => setUploading(true) : undefined;

  return (
    <>
      <MediaInput
        label={label}
        labels={{
          ...copy.input,
          previewFallback: copy.previewFallback,
        }}
        value={mediaToForm(field.value)}
        error={fieldState.error?.message}
        onOpenLibrary={canRead ? () => setPicking(true) : undefined}
        onUpload={openUpload}
        onReplace={openUpload}
        onRemove={() => field.onChange(null)}
      />
      {canCreate ? (
        <UploadDialog
          mode="one"
          open={uploading}
          onClose={() => setUploading(false)}
          onUploaded={([created]) => {
            void queryClient.invalidateQueries({ queryKey: MEDIA_QUERY_KEY });
            if (created !== undefined) field.onChange(libraryFileToInput(created));
          }}
        />
      ) : null}
      {canRead ? (
        <MediaPickerDialog
          open={picking}
          onClose={() => setPicking(false)}
          onSelect={(file) => {
            field.onChange(libraryFileToInput(file));
            setPicking(false);
          }}
        />
      ) : null}
    </>
  );
}
