import 'server-only';

import { cache } from 'react';
import { headers } from 'next/headers';

import { executeGraphql, requireRootField } from '@/apis/server/graphql/Graphql.server';
import { WebApiError } from '@/apis/WebApi.errors';

import { SITE_HEADER_QUERY, type SiteHeader } from './SiteHeader.graphql';

async function readSiteHeader(): Promise<SiteHeader | null> {
  try {
    return await executeGraphql<SiteHeader>(SITE_HEADER_QUERY, {
      mock: 'site-header',
      resolveData: requireRootField('header'),
    });
  } catch (error) {
    if (error instanceof WebApiError) return null;
    throw error;
  }
}

/**
 * Keeps one result per request: React `cache` dedupes one render, and the map keyed on the
 * request's headers object serves a later render of the same request (a 404 renders the
 * layout twice). The headers object is new per request, so nothing outlives its request
 * (ADR 0023). The lookup and the store have no `await` between them.
 */
function cachePerRequest(read: () => Promise<SiteHeader | null>): () => Promise<SiteHeader | null> {
  const resultsByRequest = new WeakMap<object, Promise<SiteHeader | null>>();
  return cache(async () => {
    const requestHeaders = await headers();
    const known = resultsByRequest.get(requestHeaders);
    if (known) return known;
    const pending = read();
    resultsByRequest.set(requestHeaders, pending);
    return pending;
  });
}

/**
 * The header with its text; one read per request. Returns `null` when the read failed,
 * so the layout renders the brand only instead of failing every page.
 */
export const loadSiteHeader = cachePerRequest(readSiteHeader);
