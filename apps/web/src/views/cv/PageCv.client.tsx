'use client';

import { useQuery } from '@tanstack/react-query';

import { clientApi } from '@/apis/client/Api.client';
import { BFF_ENDPOINTS } from '@/configs/Api.endpoints';
import { useWebSession, type WebSession } from '@/features/session';

import { ContactCard, ProfileAvatar } from './ContactCard';
import { LanguagesSection, SkillsSection, SummarySection } from './CvSection';
import { EducationsSection } from './EducationsSection';
import { ExperiencesSection } from './ExperiencesSection';
import { mainCvOf, type CvCommonText, type PageCvData } from './PageCv.graphql';
import { ProjectsSection } from './ProjectsSection';
import { ReferencesSection } from './ReferencesSection';

const ANONYMOUS_ACTOR = 'anonymous';

/** Who the data belongs to, so one actor's cache entry is never read by another. */
function actorKeyOf({ status, user }: WebSession): string {
  return status === 'authenticated' && user !== null ? `account:${user.id}` : ANONYMOUS_ACTOR;
}

/**
 * The CV data for the current visitor. Anonymous visitors (and the first paint
 * of everyone) get the server-rendered data without a request; a signed-in
 * visitor refetches through the BFF, and signing out falls back to the server
 * data. Both arrive sanitized by the server.
 */
function usePageCvData(serverData: PageCvData) {
  const actor = actorKeyOf(useWebSession());
  const isAnonymous = actor === ANONYMOUS_ACTOR;

  return useQuery({
    queryKey: ['cv', actor],
    queryFn: async () => {
      const { data } = await clientApi.get<PageCvData>(BFF_ENDPOINTS.CV);
      return data;
    },
    retry: false,
    ...(isAnonymous
      ? { initialData: serverData, staleTime: Infinity }
      : // Data read for an account is dropped as soon as nothing shows it.
        { gcTime: 0 }),
  });
}

interface PageCvClientProps {
  /** What the server rendered for the public role. */
  initialData: PageCvData;
  /** The CV labels; `null` leaves every label out. */
  text: CvCommonText | null;
}

export function PageCvClient({ initialData, text }: PageCvClientProps) {
  const { data: fetchedData, isPending, isError } = usePageCvData(initialData);

  if (isPending) {
    return <output aria-busy="true" className="block" />;
  }
  // A failed signed-in refetch keeps the anonymous CV the server rendered, with no message.
  const data = isError ? initialData : fetchedData;
  const cv = mainCvOf(data);
  if (cv === undefined) return null;

  return (
    // Prints as the on-screen sheet: tints kept, the band edge to edge, the text inside the page margin.
    <article className="text-cv-text [print-color-adjust:exact]">
      <header className="bg-cv-band print:px-cv-page flex flex-col gap-5 rounded-lg p-6 sm:flex-row sm:items-start print:flex-row print:rounded-none">
        <ProfileAvatar profile={data.profile} />
        <div className="min-w-0 flex-1">
          {cv.name ? (
            <h1 className="text-cv-ink text-3xl font-extrabold tracking-tight uppercase">
              {cv.name}
            </h1>
          ) : null}
          {cv.position ? (
            <p className="text-cv-muted tracking-cv-title mt-1 text-base uppercase">
              {cv.position}
            </p>
          ) : null}
          <ContactCard profile={data.profile} />
        </div>
      </header>
      <div className="print:px-cv-page">
        <SummarySection cv={cv} text={text} />
        <ExperiencesSection cv={cv} text={text} />
        <ProjectsSection cv={cv} text={text} />
        <SkillsSection cv={cv} text={text} />
        <EducationsSection cv={cv} text={text} />
        <LanguagesSection cv={cv} text={text} />
        <ReferencesSection cv={cv} text={text} />
      </div>
    </article>
  );
}
