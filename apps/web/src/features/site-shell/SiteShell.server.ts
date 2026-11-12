import 'server-only';

import { cache } from 'react';

import { defineContentQuery, runContentQuery } from '@/apis/server/graphql/Graphql.server';
import { API_ERROR_CODES, API_ERROR_SOURCES, logApiError, WebApiError } from '@/apis/WebApi.errors';

import {
  SITE_SHELL_OPERATION_NAME,
  SITE_SHELL_ROOT_FIELDS,
  type SiteShell,
} from './SiteShell.graphql';

export const SITE_SHELL_QUERY = defineContentQuery<SiteShell>({
  operationName: SITE_SHELL_OPERATION_NAME,
  rootFields: SITE_SHELL_ROOT_FIELDS,
});

/**
 * The header and shared texts; one request per render. Throws when any root
 * field is missing, because the layout cannot render without them.
 */
export const loadSiteShell = cache(async (): Promise<SiteShell> => {
  const { data, failedRootFields } = await runContentQuery(SITE_SHELL_QUERY);
  if (failedRootFields.length > 0) {
    const error = new WebApiError({
      source: API_ERROR_SOURCES.CMS_API_GRAPHQL,
      errorCode: API_ERROR_CODES.GRAPHQL.NO_DATA,
      operation: SITE_SHELL_OPERATION_NAME,
    });
    logApiError(error);
    throw error;
  }
  return data as SiteShell;
});
