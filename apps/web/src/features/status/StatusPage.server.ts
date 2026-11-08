import 'server-only';

import { cache } from 'react';

import { defineContentQuery, runContentQuery } from '@/apis/server/graphql/Graphql.server';

import {
  STATUS_PAGE_OPERATION_NAME,
  STATUS_PAGE_ROOT_FIELDS,
  type StatusPage,
  type StatusPageText,
} from './StatusPage.graphql';

export const STATUS_PAGE_QUERY = defineContentQuery<StatusPage>({
  operationName: STATUS_PAGE_OPERATION_NAME,
  rootFields: STATUS_PAGE_ROOT_FIELDS,
});

/**
 * The status page text; one request per render. `null` when the text could
 * not load, so the page still shows the status card (it needs no CV data).
 */
export const loadStatusPage = cache(async (): Promise<StatusPageText | null> => {
  const { data, failedRootFields } = await runContentQuery(STATUS_PAGE_QUERY);
  return failedRootFields.includes('statusPageText') ? null : data.statusPageText;
});
