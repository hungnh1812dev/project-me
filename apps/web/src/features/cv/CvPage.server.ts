import 'server-only';

import { cache } from 'react';

import { BffError } from '@/apis/server/bff/Bff.errors';
import type { BffContext } from '@/apis/server/bff/BffRoute.server';
import {
  defineContentQuery,
  runContentQuery,
  runVisitorQuery,
} from '@/apis/server/graphql/Graphql.server';
import { API_ERROR_CODES, API_ERROR_SOURCES, logApiError, WebApiError } from '@/apis/WebApi.errors';
import { sanitizeRichtextOnServer } from '@/libs/SafeRichtext.server';

import { withSetCookies } from '../session/SealedCookie.server';
import { readWebSession } from '../session/WebSession.server';
import {
  CV_PAGE_OPERATION_NAME,
  CV_PAGE_ROOT_FIELDS,
  CV_PAGE_VISITOR_OPERATION_NAME,
  sanitizeCvRichtext,
  type CvPage,
  type CvPageData,
  type CvPageText,
} from './Cv.graphql';

export const CV_PAGE_QUERY = defineContentQuery<CvPage>({
  operationName: CV_PAGE_OPERATION_NAME,
  rootFields: CV_PAGE_ROOT_FIELDS,
});

const { cvPageList, cvContact } = CV_PAGE_ROOT_FIELDS;

/** The data-only query of a signed-in visitor: the same selections as `CV_PAGE_QUERY`, without the text. */
export const CV_PAGE_VISITOR_QUERY = defineContentQuery<CvPageData>({
  operationName: CV_PAGE_VISITOR_OPERATION_NAME,
  rootFields: { cvPageList, cvContact },
});

export interface CvPageContent {
  /** The public data with its richtext sanitized. */
  data: CvPageData;
  text: CvPageText;
}

/**
 * The public CV data and the page text; one request per render even if
 * metadata and page both ask. A missing contact card is a valid page; a
 * missing list or text is a failed read.
 */
export const loadCvPage = cache(async (): Promise<CvPageContent> => {
  const { data } = await runContentQuery(CV_PAGE_QUERY);
  if (data.cvPageList === null || data.cvPageText === null) {
    const error = new WebApiError({
      source: API_ERROR_SOURCES.CMS_API_GRAPHQL,
      errorCode: API_ERROR_CODES.GRAPHQL.NO_DATA,
      operation: CV_PAGE_OPERATION_NAME,
    });
    logApiError(error);
    throw error;
  }
  return {
    data: sanitizeCvRichtext(
      { cvPageList: data.cvPageList, cvContact: data.cvContact },
      sanitizeRichtextOnServer,
    ),
    text: data.cvPageText,
  };
});

/** The CV data as the signed-in visitor: sent with their token and never cached. */
export async function loadCvPageForSession(accessToken: string): Promise<CvPageData> {
  return sanitizeCvRichtext(
    await runVisitorQuery(CV_PAGE_VISITOR_QUERY, accessToken),
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
