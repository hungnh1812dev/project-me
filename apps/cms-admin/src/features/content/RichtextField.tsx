import { lazy, Suspense } from 'react';
import type { RichtextLabels } from '@abyss/form-commons/richtext-input';

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

export function RichtextField({ name, label, labels, loadingLabel }: RichtextFieldProps) {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" aria-live="polite" className="h-32 animate-pulse rounded-md bg-muted">
          <span className="sr-only">{loadingLabel}</span>
        </div>
      }
    >
      <RichtextInput name={name} label={label} labels={labels} />
    </Suspense>
  );
}
