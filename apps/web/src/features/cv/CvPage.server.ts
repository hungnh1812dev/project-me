import 'server-only';

import { cache } from 'react';

import { GRAPHQL_FAILURE_CODES, GraphqlRequestError } from '@/apis/GraphqlResponse.rules';
import { BffError } from '@/apis/server/bff/Bff.errors';
import type { BffContext } from '@/apis/server/bff/BffRoute.server';
import {
  defineContentQuery,
  runContentQuery,
  runVisitorQuery,
} from '@/apis/server/graphql/Graphql.server';
import { sanitizeRichtextOnServer } from '@/libs/SafeRichtext.server';

import { withSetCookies } from '../session/SealedCookie.server';
import { readWebSession } from '../session/WebSession.server';
import {
  CV_PAGE_OPERATION_NAME,
  CV_PAGE_ROOT_FIELDS,
  sanitizeCvRichtext,
  type CvPageData,
} from './Cv.graphql';

const CV_PAGE_QUERY = defineContentQuery<CvPageData>({
  operationName: CV_PAGE_OPERATION_NAME,
  rootFields: CV_PAGE_ROOT_FIELDS,
});

/**
 * The public CV data with its richtext sanitized; one request per render even
 * if metadata and page both ask.
 */
export const loadCvPage = cache(async () => {
  const { data } = await runContentQuery(CV_PAGE_QUERY);
  // A missing contact card is a valid page; a missing resume list is a failed read.
  if (data.resumeList === null) throw new GraphqlRequestError(GRAPHQL_FAILURE_CODES.NO_DATA);
  return sanitizeCvRichtext({ ...data, resumeList: data.resumeList }, sanitizeRichtextOnServer);
});

/** The CV data as the signed-in visitor: sent with their token and never cached. */
export async function loadCvPageForSession(accessToken: string): Promise<CvPageData> {
  return sanitizeCvRichtext(
    await runVisitorQuery(CV_PAGE_QUERY, accessToken),
    sanitizeRichtextOnServer,
  );
}

/** `GET /api/v1/cv`: the CV page data for the signed-in visitor, `BFF_SESSION_REQUIRED` otherwise. */
export async function answerCvRead({ request }: BffContext<unknown>): Promise<Response> {
  const read = await readWebSession(request);
  if (read.status === 'signed-out') throw new BffError('BFF_SESSION_REQUIRED', {}, read.setCookies);
  return withSetCookies(
    Response.json(await loadCvPageForSession(read.accessToken)),
    read.setCookies,
  );
}
