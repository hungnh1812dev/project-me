import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  TextAreaInput,
  FormAlert,
} from '@abyss/form-commons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import { COPY } from '../../config/Copy.constants';
import { MEDIA_ALT_MAX_LENGTH } from './media.constants';
import { useMediaApi } from './media-api-context';
import { toMediaError } from './media-error';
import { MEDIA_QUERY_KEY } from './media-queries';
import type { MediaFile } from './media.api';

const copy = COPY.media.altDialog;

interface FormValues {
  alt: string;
}

export function EditAltDialog({
  file,
  onClose,
  onSaved,
  onGone,
  onCloseAutoFocus,
}: {
  file: MediaFile | null;
  onClose: () => void;
  onSaved: (file: MediaFile) => void;
  onGone: () => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const api = useMediaApi();
  const queryClient = useQueryClient();
  const [alert, setAlert] = useState<string | null>(null);
  const form = useForm<FormValues>({ values: { alt: file?.alt ?? '' } });

  const save = useMutation({
    mutationFn: (input: { id: string; alt: string }) =>
      api.updateAlt(input.id, input.alt.trim() === '' ? null : input.alt),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: MEDIA_QUERY_KEY });
      onSaved(updated);
    },
    onError: (cause) => {
      const error = toMediaError(cause);
      if (error.kind === 'gone') {
        void queryClient.invalidateQueries({ queryKey: MEDIA_QUERY_KEY });
        onGone();
      } else {
        setAlert(error.message);
      }
    },
  });

  return (
    <Dialog
      open={file !== null}
      onOpenChange={(next) => {
        if (next || save.isPending) return;
        setAlert(null);
        onClose();
      }}
    >
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        {file === null ? null : (
          <FormProvider {...form}>
            <form
              noValidate
              onSubmit={(event) =>
                void form.handleSubmit((values) => {
                  setAlert(null);
                  save.mutate({ id: file.id, alt: values.alt });
                })(event)
              }
              className="grid gap-4"
            >
              <DialogHeader>
                <DialogTitle>{copy.title(file.fileName)}</DialogTitle>
                <DialogDescription>{copy.description}</DialogDescription>
              </DialogHeader>
              {alert === null ? null : (
                <FormAlert tone="error">{alert}</FormAlert>
              )}
              <TextAreaInput<FormValues>
                name="alt"
                label={copy.label}
                rows={3}
                rules={{
                  validate: (value) =>
                    Array.from(value).length <= MEDIA_ALT_MAX_LENGTH ||
                    copy.tooLong(MEDIA_ALT_MAX_LENGTH),
                }}
              />
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" disabled={save.isPending}>
                    {copy.cancel}
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  variant="primary"
                  loading={save.isPending}
                >
                  {copy.save}
                </Button>
              </DialogFooter>
            </form>
          </FormProvider>
        )}
      </DialogContent>
    </Dialog>
  );
}
