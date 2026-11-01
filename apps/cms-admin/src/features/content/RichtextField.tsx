import { lazy, Suspense, useState } from 'react';
import type { RichtextImage, RichtextLabels } from '@abyss/form-commons/richtext-input';

import { useCallerAccess } from '../access';
import { ImageInsertDialog, MEDIA_SUBJECT } from '../media';

// Tiptap is the heaviest dependency; load it only when a richtext field renders.
const RichtextInput = lazy(() =>
  import('@abyss/form-commons/richtext-input').then((module) => ({
    default: module.RichtextInput,
  })),
);

interface RichtextFieldProps {
  name: string;
  label: string;
  labels: RichtextLabels;
  loadingLabel: string;
}

type InsertImage = (image: RichtextImage) => void;

export function RichtextField({ name, label, labels, loadingLabel }: RichtextFieldProps) {
  const caller = useCallerAccess();
  // A function in state must be wrapped, or React would call it as an updater.
  const [insertImage, setInsertImage] = useState<{ insert: InsertImage } | null>(null);

  const canRead = caller.isReady && caller.can(MEDIA_SUBJECT, 'read');
  const canCreate = caller.isReady && caller.can(MEDIA_SUBJECT, 'create');

  return (
    <>
      <Suspense
        fallback={
          <div
            aria-busy="true"
            aria-live="polite"
            className="h-32 animate-pulse rounded-md bg-muted"
          >
            <span className="sr-only">{loadingLabel}</span>
          </div>
        }
      >
        <RichtextInput
          name={name}
          label={label}
          labels={labels}
          onRequestImage={canRead ? (insert) => setInsertImage({ insert }) : undefined}
        />
      </Suspense>
      {canRead ? (
        <ImageInsertDialog
          open={insertImage !== null}
          onClose={() => setInsertImage(null)}
          onInsert={(image) => insertImage?.insert(image)}
          canUpload={canCreate}
          canChoose={canRead}
        />
      ) : null}
    </>
  );
}
