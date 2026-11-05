import 'server-only';

import { cache } from 'react';

import { BffError } from '../../apis/server/bff/Bff.errors';
import type { BffContext } from '../../apis/server/bff/BffRoute.server';
import { fetchGraphql } from '../../apis/server/graphql/Graphql.server';
import { sanitizeRichtextOnServer } from '../../libs/SafeRichtext.server';
import { withSetCookies } from '../session/SealedCookie.server';
import { readWebSession } from '../session/WebSession.server';
import { CV_PAGE_DOCUMENT, sanitizeCvRichtext, type CvPageData } from './Cv.graphql';

/**
 * The public CV data with its richtext sanitized; one request per render even
 * if metadata and page both ask.
 */
export const loadCvPage = cache(async () =>
  sanitizeCvRichtext(await fetchGraphql<CvPageData>(CV_PAGE_DOCUMENT), sanitizeRichtextOnServer),
);

/** The CV data as the signed-in visitor: sent with their token and never cached. */
export async function loadCvPageForSession(accessToken: string): Promise<CvPageData> {
  return sanitizeCvRichtext(
    await fetchGraphql<CvPageData>(CV_PAGE_DOCUMENT, undefined, { accessToken }),
    sanitizeRichtextOnServer,
  );
}

/** `GET /bff/v1/cv`: the CV page data for the signed-in visitor, `BFF_SESSION_REQUIRED` otherwise. */
export async function answerCvRead({ request }: BffContext<unknown>): Promise<Response> {
  const read = await readWebSession(request);
  if (read.status === 'signed-out') throw new BffError('BFF_SESSION_REQUIRED', {}, read.setCookies);
  return withSetCookies(
    Response.json(await loadCvPageForSession(read.accessToken)),
    read.setCookies,
  );
}
