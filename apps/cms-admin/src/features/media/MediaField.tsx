import { MediaInput } from '@abyss/form-commons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useController } from 'react-hook-form';

import { COPY } from '../../config/copy.constants';
import { MEDIA_SUBJECT } from './media.constants';
import { useCallerAccess } from '../access';
import { useMediaApi } from './media-api-context';
import { toMediaError } from './media-error';
import { libraryFileToInput, mediaToForm } from './media-field-value';
import { MEDIA_QUERY_KEY } from './media-queries';
import { MediaPickerDialog } from './MediaPickerDialog';

const copy = COPY.media;

/** A `media` field of the dynamic form: attach from the library, upload, or detach. */
export function MediaField({ name, label }: { name: string; label: string }) {
  const { field, fieldState } = useController({ name });
  const api = useMediaApi();
  const queryClient = useQueryClient();
  const caller = useCallerAccess();
  const [picking, setPicking] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const canRead = caller.isReady && caller.can(MEDIA_SUBJECT, 'read');
  const canCreate = caller.isReady && caller.can(MEDIA_SUBJECT, 'create');

  const upload = useMutation({
    mutationFn: (file: File) => api.upload(file),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: MEDIA_QUERY_KEY });
      setUploadError(null);
      field.onChange(libraryFileToInput(created));
    },
    onError: (cause) => setUploadError(toMediaError(cause).message),
  });

  return (
    <>
      <MediaInput
        label={label}
        labels={{
          ...copy.input,
          previewFallback: copy.previewFallback,
        }}
        value={mediaToForm(field.value)}
        disabled={upload.isPending}
        error={uploadError ?? fieldState.error?.message}
        onOpenLibrary={
          canRead
            ? () => {
                setUploadError(null);
                setPicking(true);
              }
            : undefined
        }
        onFilePick={
          canCreate
            ? (file) => {
                setUploadError(null);
                upload.mutate(file);
              }
            : undefined
        }
        onRemove={() => {
          setUploadError(null);
          field.onChange(null);
        }}
      />
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
