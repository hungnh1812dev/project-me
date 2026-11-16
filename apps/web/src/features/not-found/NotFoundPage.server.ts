import 'server-only';

import { cache } from 'react';

import { defineContentQuery, runContentQuery } from '@/apis/server/graphql/Graphql.server';
import { API_ERROR_CODES, API_ERROR_SOURCES, logApiError, WebApiError } from '@/apis/WebApi.errors';

import {
  NOT_FOUND_PAGE_OPERATION_NAME,
  NOT_FOUND_PAGE_ROOT_FIELDS,
  type NotFoundPage,
  type NotFoundText,
} from './NotFoundPage.graphql';

export const NOT_FOUND_PAGE_QUERY = defineContentQuery<NotFoundPage>({
  operationName: NOT_FOUND_PAGE_OPERATION_NAME,
  rootFields: NOT_FOUND_PAGE_ROOT_FIELDS,
  singleTypeRootFields: ['notFoundText'],
});

/** The not-found page text; one request per render. `null` when it could not load (the page then shows the last-resort text). */
export const loadNotFoundText = cache(async (): Promise<NotFoundText | null> => {
  const { data, failedRootFields } = await runContentQuery(NOT_FOUND_PAGE_QUERY);
  if (failedRootFields.length === 0 && data.notFoundText) return data.notFoundText;
  logApiError(
    new WebApiError({
      source: API_ERROR_SOURCES.CMS_API_GRAPHQL,
      errorCode: API_ERROR_CODES.GRAPHQL.NO_DATA,
      operation: NOT_FOUND_PAGE_OPERATION_NAME,
    }),
  );
  return null;
});
