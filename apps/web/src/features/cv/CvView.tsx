'use client';

import type { ReactNode } from 'react';

import { COPY } from '../../config/Copy.constants';
import { type CvPageData, mainResumeOf } from './Cv.graphql';
import { useCvContent } from './useCvContent';

interface CvViewProps {
  /** What the server rendered for the public role. */
  initialData: CvPageData;
  /** The resume sections; the page shows the heading and states without it. */
  renderSections?: (data: CvPageData) => ReactNode;
}

export function CvView({ initialData, renderSections }: CvViewProps) {
  const { data, isPending, isError } = useCvContent(initialData);

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
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        {resume.name ?? COPY.cv.fallbackName}
      </h1>
      {resume.position ? (
        <p className="mt-1 text-base text-muted-foreground">
          {resume.position}
        </p>
      ) : null}
      {renderSections?.(data)}
    </>
  );
}
