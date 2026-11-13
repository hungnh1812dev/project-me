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
 * The header and shared texts; one request per render. Returns `null` when any
 * root field is missing (failed, or answered null because no content is published),
 * so the layout renders without the shell instead of failing every page.
 */
export const loadSiteShell = cache(async (): Promise<SiteShell | null> => {
  const { data, failedRootFields } = await runContentQuery(SITE_SHELL_QUERY);
  const { header, siteText, signInText } = data;
  if (failedRootFields.length === 0 && header && siteText && signInText) {
    return { header, siteText, signInText };
  }
  logApiError(
    new WebApiError({
      source: API_ERROR_SOURCES.CMS_API_GRAPHQL,
      errorCode: API_ERROR_CODES.GRAPHQL.NO_DATA,
      operation: SITE_SHELL_OPERATION_NAME,
    }),
  );
  return null;
});
