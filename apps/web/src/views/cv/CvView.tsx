'use client';

import { COPY } from '../../configs/Copy.constants';
import { mainResumeOf, type CvPageData } from '../../features/cv/Cv.graphql';
import { useWebSession } from '../../features/session';
import { ContactCard } from './ContactCard';
import { MaskedTextContext, ResumeSections } from './ResumeSections';
import { useCvContent } from './useCvContent';

interface CvViewProps {
  /** What the server rendered for the public role. */
  initialData: CvPageData;
}

export function CvView({ initialData }: CvViewProps) {
  const { data, isPending, isError } = useCvContent(initialData);
  const { kind } = useWebSession();
  const maskedText = kind === 'reviewer' ? COPY.cv.maskedValueForReviewer : COPY.cv.maskedValue;

  if (isPending) {
    return <output className="text-muted-foreground block text-sm">{COPY.cv.loading}</output>;
  }
  if (isError) {
    return (
      <p
        role="alert"
        className="bg-destructive-soft text-destructive-strong rounded-md px-3 py-2 text-sm"
      >
        {COPY.cv.refetchFailed}
      </p>
    );
  }

  const resume = mainResumeOf(data);
  if (resume === undefined) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">{COPY.cv.emptyTitle}</h1>
        <p className="text-muted-foreground mt-2 max-w-prose text-sm">{COPY.cv.emptyDescription}</p>
      </>
    );
  }

  return (
    <MaskedTextContext.Provider value={maskedText}>
      <h1 className="text-2xl font-semibold tracking-tight">
        {resume.name ?? COPY.cv.fallbackName}
      </h1>
      {resume.position ? (
        <p className="text-muted-foreground mt-1 text-base">{resume.position}</p>
      ) : null}
      <ContactCard contact={data.cvContact} fallbackName={resume.name ?? COPY.cv.fallbackName} />
      <ResumeSections resume={resume} />
    </MaskedTextContext.Provider>
  );
}
