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
import { withSetCookies } from '@/features/session/SealedCookie.server';
import { readWebSession } from '@/features/session/WebSession.server';
import { sanitizeRichtextOnServer } from '@/libs/SafeRichtext.server';

import {
  PAGE_CV_OPERATION_NAME,
  PAGE_CV_ROOT_FIELDS,
  PAGE_CV_VISITOR_OPERATION_NAME,
  sanitizeCvRichtext,
  type PageCvData,
  type PageCvResult,
  type PageCvText,
} from './PageCv.graphql';

export const PAGE_CV_QUERY = defineContentQuery<PageCvResult>({
  operationName: PAGE_CV_OPERATION_NAME,
  rootFields: PAGE_CV_ROOT_FIELDS,
});

const { pageCvAList, profile } = PAGE_CV_ROOT_FIELDS;

/** The data-only query of a signed-in visitor: the same selections as `PAGE_CV_QUERY`, without the text. */
export const PAGE_CV_VISITOR_QUERY = defineContentQuery<PageCvData>({
  operationName: PAGE_CV_VISITOR_OPERATION_NAME,
  rootFields: { pageCvAList, profile },
});

export interface PageCvContent {
  /** The public data with its richtext sanitized. */
  data: PageCvData;
  text: PageCvText;
}

/**
 * The public CV data and the page text; one request per render even if
 * metadata and page both ask. A missing profile is a valid page; a missing
 * list or text is a failed read.
 */
export const loadPageCv = cache(async (): Promise<PageCvContent> => {
  const { data } = await runContentQuery(PAGE_CV_QUERY);
  if (data.pageCvAList === null || data.pageCvText === null) {
    const error = new WebApiError({
      source: API_ERROR_SOURCES.CMS_API_GRAPHQL,
      errorCode: API_ERROR_CODES.GRAPHQL.NO_DATA,
      operation: PAGE_CV_OPERATION_NAME,
    });
    logApiError(error);
    throw error;
  }
  return {
    data: sanitizeCvRichtext(
      { pageCvAList: data.pageCvAList, profile: data.profile },
      sanitizeRichtextOnServer,
    ),
    text: data.pageCvText,
  };
});

/** The CV data as the signed-in visitor: sent with their token and never cached. */
export async function loadPageCvForSession(accessToken: string): Promise<PageCvData> {
  return sanitizeCvRichtext(
    await runVisitorQuery(PAGE_CV_VISITOR_QUERY, accessToken),
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
