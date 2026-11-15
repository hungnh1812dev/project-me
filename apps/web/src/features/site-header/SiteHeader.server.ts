import 'server-only';

import { cache } from 'react';

import { defineContentQuery, runContentQuery } from '@/apis/server/graphql/Graphql.server';
import { API_ERROR_CODES, API_ERROR_SOURCES, logApiError, WebApiError } from '@/apis/WebApi.errors';

import {
  SITE_HEADER_OPERATION_NAME,
  SITE_HEADER_ROOT_FIELDS,
  type SiteHeader,
} from './SiteHeader.graphql';

export const SITE_HEADER_QUERY = defineContentQuery<SiteHeader>({
  operationName: SITE_HEADER_OPERATION_NAME,
  rootFields: SITE_HEADER_ROOT_FIELDS,
});

/**
 * The header with its text; one request per render. Returns `null` when the root field
 * failed or answered null, so the layout renders the brand only instead of failing every page.
 */
export const loadSiteHeader = cache(async (): Promise<SiteHeader | null> => {
  const { data, failedRootFields } = await runContentQuery(SITE_HEADER_QUERY);
  const { header } = data;
  if (failedRootFields.length === 0 && header) return { header };
  logApiError(
    new WebApiError({
      source: API_ERROR_SOURCES.CMS_API_GRAPHQL,
      errorCode: API_ERROR_CODES.GRAPHQL.NO_DATA,
      operation: SITE_HEADER_OPERATION_NAME,
    }),
  );
  return null;
});
