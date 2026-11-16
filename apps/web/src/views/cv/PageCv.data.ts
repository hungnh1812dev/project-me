import 'server-only';

import { cache } from 'react';

import { BffError } from '@/apis/server/bff/Bff.errors';
import type { BffContext } from '@/apis/server/bff/BffRoute.server';
import { executeGraphql, requireRootField } from '@/apis/server/graphql/Graphql.server';
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

export type PageCvContent =
  | {
      state: 'cv';
      /** The public data with its richtext sanitized; `profile` is `null` when it could not be read. */
      data: PageCvData;
      text: CvCommonText | null;
    }
  /** No main CV, or its read failed: the page answers 200 with `text.noCvText` or the last-resort text. */
  | { state: 'no-cv-live'; text: CvCommonText | null };

/**
 * The public CV, its profile and the page text, each read on its own so one failure never fails
 * the page (public-site PS-2); one request per render even if metadata and page both ask.
 * `executeGraphql` logged each failure, so nothing is logged again here.
 */
export const loadPageCv = cache(async (): Promise<PageCvContent> => {
  const [list, profile, text] = await Promise.all([
    readOrNull(() =>
      executeGraphql<Pick<PageCvData, 'pageCvAList'>>(PAGE_CV_A_QUERY, {
        mock: 'page-cv-a',
        resolveData: requireRootField('pageCvAList'),
      }),
    ),
    readOrNull(async () => {
      const { profile: read } = await executeGraphql<{ profile: Profile }>(PROFILE_QUERY, {
        mock: 'profile',
        resolveData: requireRootField('profile'),
      });
      return read;
    }),
    readOrNull(async () => {
      const { cvCommonText } = await executeGraphql<{ cvCommonText: CvCommonText }>(
        CV_COMMON_TEXT_QUERY,
        { mock: 'cv-common-text', resolveData: requireRootField('cvCommonText') },
      );
      return sanitizeCommonText(cvCommonText);
    }),
  ]);
  if (list === null || list.pageCvAList.data.length === 0) return { state: 'no-cv-live', text };
  return {
    state: 'cv',
    data: sanitizeCvRichtext({ pageCvAList: list.pageCvAList, profile }, sanitizeRichtextOnServer),
    text,
  };
});

async function readOrNull<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

function sanitizeCommonText(text: CvCommonText): CvCommonText {
  return {
    ...text,
    noCvText: typeof text.noCvText === 'string' ? sanitizeRichtextOnServer(text.noCvText) : null,
  };
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
