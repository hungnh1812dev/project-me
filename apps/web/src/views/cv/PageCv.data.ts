import 'server-only';

import { cache } from 'react';

import { BffError } from '@/apis/server/bff/Bff.errors';
import type { BffContext } from '@/apis/server/bff/BffRoute.server';
import { executeGraphql, requireRootField } from '@/apis/server/graphql/Graphql.server';
import { WebApiError } from '@/apis/WebApi.errors';
import { withSetCookies } from '@/features/session/SealedCookie.server';
import { readWebSession } from '@/features/session/WebSession.server';
import { sanitizeRichtextOnServer } from '@/libs/SafeRichtext.server';

import {
  CV_COMMON_TEXT_QUERY,
  PAGE_CV_A_QUERY,
  PAGE_CV_VISITOR_QUERY,
  PROFILE_QUERY,
  sanitizeCvRichtext,
  type CvCommonText,
  type PageCvData,
  type Profile,
} from './PageCv.graphql';

export interface PageCvContent {
  /** The public data with its richtext sanitized. */
  data: PageCvData;
  text: CvCommonText;
}

/**
 * The public CV data and the page text; one request per render even if metadata and page both
 * ask. A missing profile is a valid page; a failed list or text throws (`executeGraphql`
 * logged it).
 */
export const loadPageCv = cache(async (): Promise<PageCvContent> => {
  const [{ pageCvAList }, profile, { cvCommonText }] = await Promise.all([
    executeGraphql<Pick<PageCvData, 'pageCvAList'>>(PAGE_CV_A_QUERY, {
      mock: 'page-cv-a',
      resolveData: requireRootField('pageCvAList'),
    }),
    readProfile(),
    executeGraphql<{ cvCommonText: CvCommonText }>(CV_COMMON_TEXT_QUERY, {
      mock: 'cv-common-text',
      resolveData: requireRootField('cvCommonText'),
    }),
  ]);
  return {
    data: sanitizeCvRichtext({ pageCvAList, profile }, sanitizeRichtextOnServer),
    text: cvCommonText,
  };
});

async function readProfile(): Promise<Profile | null> {
  try {
    const { profile } = await executeGraphql<{ profile: Profile }>(PROFILE_QUERY, {
      mock: 'profile',
      resolveData: requireRootField('profile'),
    });
    return profile;
  } catch (error) {
    if (error instanceof WebApiError) return null;
    throw error;
  }
}

/** The CV data as the signed-in visitor: sent with their token and never cached. */
export async function loadPageCvForSession(accessToken: string): Promise<PageCvData> {
  return sanitizeCvRichtext(
    await executeGraphql<PageCvData>(PAGE_CV_VISITOR_QUERY, { accessToken }),
    sanitizeRichtextOnServer,
  );
}

/** `GET /api/v1/cv`: the CV page data for the signed-in visitor, `BFF_SESSION_REQUIRED` otherwise. */
export async function answerCvRead({ request }: BffContext<unknown>): Promise<Response> {
  const read = await readWebSession(request);
  if (read.status === 'signed-out') throw new BffError('BFF_SESSION_REQUIRED', {}, read.setCookies);
  return withSetCookies(
    Response.json(await loadPageCvForSession(read.accessToken)),
    read.setCookies,
  );
}
