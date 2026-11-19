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
  /** The `pageCvA` read failed and no mock filled it: the page answers 200 with `text.noCvText` or the last-resort text. */
  | { state: 'no-cv-live'; text: CvCommonText | null }
  /** A malformed id, or no published CV has it: the page answers 404 (public-site PS-2). */
  | { state: 'not-found' };

const CV_DOCUMENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The one UUID check of the page and the BFF: the id, or `null` when `value` is not a UUID. */
export function parseCvDocumentId(value: unknown): string | null {
  return typeof value === 'string' && CV_DOCUMENT_ID_PATTERN.test(value) ? value : null;
}

/**
 * The CV of one `documentId`, its profile and the page text, each read on its own so one failure
 * never fails the page (public-site PS-2); one request per render even if metadata and page both
 * ask. `executeGraphql` logged each failure, so nothing is logged again here.
 */
export const loadPageCv = cache(async (documentId: string): Promise<PageCvContent> => {
  const validId = parseCvDocumentId(documentId);
  if (validId === null) return { state: 'not-found' };
  const [cvRead, profile, text] = await Promise.all([
    readOrNull(() =>
      executeGraphql<Pick<PageCvData, 'pageCvA'>>(PAGE_CV_A_QUERY, {
        mock: 'page-cv-a',
        variables: { documentId: validId },
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
  if (cvRead === null) return { state: 'no-cv-live', text };
  // The resolver accepts a null root field: no published CV has this id, never mocked (PS-2).
  if (cvRead.pageCvA === null) return { state: 'not-found' };
  return {
    state: 'cv',
    data: sanitizeCvRichtext({ pageCvA: cvRead.pageCvA, profile }, sanitizeRichtextOnServer),
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

/** The CV data as the signed-in visitor: sent with their token and never cached; `null` when no published CV has the id. */
export async function loadPageCvForSession(
  accessToken: string,
  documentId: string,
): Promise<PageCvData | null> {
  const data = await executeGraphql<Pick<PageCvData, 'pageCvA'> & { profile: Profile | null }>(
    PAGE_CV_VISITOR_QUERY,
    { accessToken, variables: { documentId } },
  );
  if (data.pageCvA === null || data.pageCvA === undefined) return null;
  return sanitizeCvRichtext(
    { pageCvA: data.pageCvA, profile: data.profile ?? null },
    sanitizeRichtextOnServer,
  );
}

/** `GET /api/v1/cv/{documentId}`: the CV page data for the signed-in visitor; `BFF_SESSION_REQUIRED` first for any id, then `BFF_NOT_FOUND` alike for a malformed, unknown or unpublished id. */
export async function answerCvRead({ request, params }: BffContext<unknown>): Promise<Response> {
  const read = await readWebSession(request);
  if (read.status === 'signed-out') throw new BffError('BFF_SESSION_REQUIRED', {}, read.setCookies);
  const documentId = parseCvDocumentId(params['documentId']);
  if (documentId === null) throw new BffError('BFF_NOT_FOUND');
  const data = await loadPageCvForSession(read.accessToken, documentId);
  // An unknown or unpublished id answers exactly like a malformed one.
  if (data === null) throw new BffError('BFF_NOT_FOUND', {}, read.setCookies);
  return withSetCookies(Response.json(data), read.setCookies);
}
