'use client';

import { COPY } from '../../config/Copy.constants';
import { ContactCard } from './ContactCard';
import { type CvPageData, mainResumeOf } from './Cv.graphql';
import { useWebSession } from '../session';
import { MaskedTextContext, ResumeSections } from './ResumeSections';
import { useCvContent } from './useCvContent';

interface CvViewProps {
  /** What the server rendered for the public role. */
  initialData: CvPageData;
}

export function CvView({ initialData }: CvViewProps) {
  const { data, isPending, isError } = useCvContent(initialData);
  const { kind } = useWebSession();
  const maskedText =
    kind === 'reviewer' ? COPY.cv.maskedValueForReviewer : COPY.cv.maskedValue;

  if (isPending) {
    return (
      <output className="block text-sm text-muted-foreground">
        {COPY.cv.loading}
      </output>
    );
  }
  if (isError) {
    return (
      <p
        role="alert"
        className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive-strong"
      >
        {COPY.cv.refetchFailed}
      </p>
    );
  }

  const resume = mainResumeOf(data);
  if (resume === undefined) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">
          {COPY.cv.emptyTitle}
        </h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          {COPY.cv.emptyDescription}
        </p>
      </>
    );
  }

  return (
    <MaskedTextContext.Provider value={maskedText}>
      <h1 className="text-2xl font-semibold tracking-tight">
        {resume.name ?? COPY.cv.fallbackName}
      </h1>
      {resume.position ? (
        <p className="mt-1 text-base text-muted-foreground">
          {resume.position}
        </p>
      ) : null}
      <ContactCard
        contact={data.cvContact}
        fallbackName={resume.name ?? COPY.cv.fallbackName}
      />
      <ResumeSections resume={resume} />
    </MaskedTextContext.Provider>
  );
}
