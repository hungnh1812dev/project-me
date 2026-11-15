'use client';

import { useQuery } from '@tanstack/react-query';

import { clientApi } from '@/apis/client/Api.client';
import { BFF_ENDPOINTS } from '@/configs/Api.endpoints';
import { useWebSession, type WebSession } from '@/features/session';

import { ContactCard } from './ContactCard';
import { MaskedTextContext, SkillsSection, SummarySection } from './CvSection';
import { EducationsSection } from './EducationsSection';
import { ExperiencesSection } from './ExperiencesSection';
import { mainCvOf, type PageCvData, type PageCvText } from './PageCv.graphql';
import { ProjectsSection } from './ProjectsSection';

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
  text: PageCvText;
}

export function PageCvClient({ initialData, text }: PageCvClientProps) {
  const { data: fetchedData, isPending, isError } = usePageCvData(initialData);

  if (isPending) {
    return <output className="text-muted-foreground block text-sm">{text.loading}</output>;
  }
  // A failed signed-in refetch keeps the anonymous CV the server rendered.
  const data = isError ? initialData : fetchedData;
  const cv = mainCvOf(data);
  if (cv === undefined) return null;

  return (
    <MaskedTextContext.Provider value={text.maskedValue}>
      {isError ? (
        <p
          role="alert"
          className="bg-destructive-soft text-destructive-strong mb-4 rounded-md px-3 py-2 text-sm"
        >
          {text.refetchFailed}
        </p>
      ) : null}
      <h1 className="text-2xl font-semibold tracking-tight">{cv.name ?? text.fallbackName}</h1>
      {cv.position ? <p className="text-muted-foreground mt-1 text-base">{cv.position}</p> : null}
      <ContactCard
        profile={data.profile}
        fallbackName={cv.name ?? text.fallbackName}
        text={text.contact}
      />
      <SummarySection cv={cv} text={text} />
      <SkillsSection cv={cv} text={text} />
      <ExperiencesSection cv={cv} text={text} />
      <ProjectsSection cv={cv} text={text} />
      <EducationsSection cv={cv} text={text} />
    </MaskedTextContext.Provider>
  );
}
