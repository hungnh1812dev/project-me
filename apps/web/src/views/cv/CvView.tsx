'use client';

import { mainResumeOf, type CvPageData, type CvPageText } from '@/features/cv/Cv.graphql';

import { ContactCard } from './ContactCard';
import { MaskedTextContext, ResumeSections } from './ResumeSections';
import { useCvContent } from './useCvContent';

interface CvViewProps {
  /** What the server rendered for the public role. */
  initialData: CvPageData;
  text: CvPageText;
}

export function CvView({ initialData, text }: CvViewProps) {
  const { data: fetchedData, isPending, isError } = useCvContent(initialData);

  if (isPending) {
    return <output className="text-muted-foreground block text-sm">{text.loading}</output>;
  }
  // A failed signed-in refetch keeps the anonymous CV the server rendered.
  const data = isError ? initialData : fetchedData;
  const refetchAlert = isError ? (
    <p
      role="alert"
      className="bg-destructive-soft text-destructive-strong mb-4 rounded-md px-3 py-2 text-sm"
    >
      {text.refetchFailed}
    </p>
  ) : null;

  const resume = mainResumeOf(data);
  if (resume === undefined) {
    return (
      <>
        {refetchAlert}
        <h1 className="text-2xl font-semibold tracking-tight">{text.emptyTitle}</h1>
        <p className="text-muted-foreground mt-2 max-w-prose text-sm">{text.emptyDescription}</p>
      </>
    );
  }

  return (
    <MaskedTextContext.Provider value={text.maskedValue}>
      {refetchAlert}
      <h1 className="text-2xl font-semibold tracking-tight">{resume.name ?? text.fallbackName}</h1>
      {resume.position ? (
        <p className="text-muted-foreground mt-1 text-base">{resume.position}</p>
      ) : null}
      <ContactCard
        contact={data.cvContact}
        fallbackName={resume.name ?? text.fallbackName}
        text={text.contact}
      />
      <ResumeSections resume={resume} text={text} />
    </MaskedTextContext.Provider>
  );
}
