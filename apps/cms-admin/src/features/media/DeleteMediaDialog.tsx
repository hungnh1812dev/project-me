import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormAlert,
} from '@abyss/form-commons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { COPY } from '../../config/Copy.constants';
import { useMediaApi } from './media-api-context';
import { toMediaError } from './media-error';
import { MEDIA_QUERY_KEY } from './media-queries';
import type { MediaFile } from './media.api';

const copy = COPY.media.deleteDialog;

/** Confirm delete; a file still attached to a document keeps the dialog open with the reason. */
export function DeleteMediaDialog({
  file,
  onClose,
  onDone,
  onCloseAutoFocus,
}: {
  file: MediaFile | null;
  onClose: () => void;
  onDone: (file: MediaFile, outcome: 'deleted' | 'gone') => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const api = useMediaApi();
  const queryClient = useQueryClient();
  const [alert, setAlert] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: (target: MediaFile) => api.remove(target.id),
    onSuccess: (_data, target) => {
      void queryClient.invalidateQueries({ queryKey: MEDIA_QUERY_KEY });
      onDone(target, 'deleted');
    },
    onError: (cause, target) => {
      const error = toMediaError(cause);
      if (error.kind === 'gone') {
        void queryClient.invalidateQueries({ queryKey: MEDIA_QUERY_KEY });
        onDone(target, 'gone');
      } else {
        setAlert(error.message);
      }
    },
  });

  return (
    <Dialog
      open={file !== null}
      onOpenChange={(next) => {
        if (next || remove.isPending) return;
        setAlert(null);
        onClose();
      }}
    >
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        {file === null ? null : (
          <>
            <DialogHeader>
              <DialogTitle>{copy.title(file.fileName)}</DialogTitle>
              <DialogDescription>{copy.description}</DialogDescription>
            </DialogHeader>
            {alert === null ? null : (
              <FormAlert tone="error">{alert}</FormAlert>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" disabled={remove.isPending}>
                  {copy.cancel}
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="destructive"
                loading={remove.isPending}
                onClick={() => {
                  setAlert(null);
                  remove.mutate(file);
                }}
              >
                {copy.submit(file.fileName)}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
