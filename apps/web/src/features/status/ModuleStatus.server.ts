import 'server-only';

import { cache } from 'react';

import { defineContentQuery, runContentQuery } from '@/apis/server/graphql/Graphql.server';

import {
  MODULE_STATUS_OPERATION_NAME,
  MODULE_STATUS_ROOT_FIELDS,
  type ModuleStatus,
  type ModuleStatusText,
} from './ModuleStatus.graphql';

export const MODULE_STATUS_QUERY = defineContentQuery<ModuleStatus>({
  operationName: MODULE_STATUS_OPERATION_NAME,
  rootFields: MODULE_STATUS_ROOT_FIELDS,
});

/**
 * The module status text; one request per render. `null` when the text could
 * not load, so the page still shows the status card (it needs no CV data).
 */
export const loadModuleStatusText = cache(async (): Promise<ModuleStatusText | null> => {
  const { data, failedRootFields } = await runContentQuery(MODULE_STATUS_QUERY);
  return failedRootFields.includes('statusText') ? null : data.statusText;
});
