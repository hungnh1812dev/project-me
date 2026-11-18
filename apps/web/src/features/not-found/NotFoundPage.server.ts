import 'server-only';

import { cache } from 'react';

import { executeGraphql, requireRootField } from '@/apis/server/graphql/Graphql.server';
import { WebApiError } from '@/apis/WebApi.errors';

import { NOT_FOUND_PAGE_QUERY, type NotFoundPage, type NotFoundText } from './NotFoundPage.graphql';

/** The not-found page text; one request per render. `null` when it could not load (the page then shows the last-resort text). */
export const loadNotFoundText = cache(async (): Promise<NotFoundText | null> => {
  try {
    const { notFoundText } = await executeGraphql<NotFoundPage>(NOT_FOUND_PAGE_QUERY, {
      mock: 'not-found-page',
      resolveData: requireRootField('notFoundText'),
    });
    return notFoundText;
  } catch (error) {
    if (error instanceof WebApiError) return null;
    throw error;
  }
});
