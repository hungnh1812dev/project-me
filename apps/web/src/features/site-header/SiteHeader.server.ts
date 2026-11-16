import 'server-only';

import { cache } from 'react';

import { executeGraphql, requireRootField } from '@/apis/server/graphql/Graphql.server';
import { WebApiError } from '@/apis/WebApi.errors';

import { SITE_HEADER_QUERY, type SiteHeader } from './SiteHeader.graphql';

/**
 * The header with its text; one request per render. Returns `null` when the read failed,
 * so the layout renders the brand only instead of failing every page.
 */
export const loadSiteHeader = cache(async (): Promise<SiteHeader | null> => {
  try {
    return await executeGraphql<SiteHeader>(SITE_HEADER_QUERY, {
      mock: 'site-header',
      resolveData: requireRootField('header'),
    });
  } catch (error) {
    if (error instanceof WebApiError) return null;
    throw error;
  }
});
