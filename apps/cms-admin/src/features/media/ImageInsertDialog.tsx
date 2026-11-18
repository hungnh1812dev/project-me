import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@abyss/form-commons';
import { useScreenText } from '@configs/locales';
import { useQueryClient } from '@tanstack/react-query';

import type { MediaFile } from './Media.api';
import { MEDIA_IMAGE_MIME_TYPES } from './Media.constants';
import { MEDIA_QUERY_KEY } from './Media.queries';
import { MediaPickerDialog } from './MediaPickerDialog';
import { UploadDialog } from './UploadDialog';

/** What the editor needs to put a library image at the cursor. */
export interface InsertedImage {
  src: string;
  alt: string;
  mediaId: string;
}

type Step = 'choose' | 'upload' | 'library';

/** Two ways to get an image into the editor: upload a new one, or pick from the library. */
export function ImageInsertDialog({
  open,
  onClose,
  onInsert,
  canUpload,
  canChoose,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (image: InsertedImage) => void;
  canUpload: boolean;
  canChoose: boolean;
}) {
  const copy = useScreenText('media').media.imageInsert;
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('choose');

  const finish = () => {
    setStep('choose');
    onClose();
  };
  const insertFile = (file: MediaFile) => {
    onInsert({ src: file.url, alt: file.alt ?? '', mediaId: file.id });
    finish();
  };

  if (!open) return null;
  if (step === 'upload') {
    return (
      <UploadDialog
        mode="one"
        open
        accept={MEDIA_IMAGE_MIME_TYPES}
        onClose={finish}
        onUploaded={([created]) => {
          void queryClient.invalidateQueries({ queryKey: MEDIA_QUERY_KEY });
          if (created !== undefined)
            onInsert({ src: created.url, alt: created.alt ?? '', mediaId: created.id });
        }}
      />
    );
  }
  if (step === 'library') {
    return <MediaPickerDialog open onlyImages onClose={finish} onSelect={insertFile} />;
  }
  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : finish())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {canUpload ? (
            <Button type="button" variant="primary" onClick={() => setStep('upload')}>
              {copy.upload}
            </Button>
          ) : null}
          {canChoose ? (
            <Button type="button" onClick={() => setStep('library')}>
              {copy.library}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={finish}>
            {copy.cancel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
