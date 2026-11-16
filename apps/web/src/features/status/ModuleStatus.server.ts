import 'server-only';

import { cache } from 'react';

import { executeGraphql, requireRootField } from '@/apis/server/graphql/Graphql.server';
import { WebApiError } from '@/apis/WebApi.errors';

import {
  MODULE_STATUS_QUERY,
  type ModuleStatus,
  type ModuleStatusText,
} from './ModuleStatus.graphql';

/**
 * The module status text; one request per render. `null` when the text could
 * not load, so the page still shows the status card (it needs no CV data).
 */
export const loadModuleStatusText = cache(async (): Promise<ModuleStatusText | null> => {
  try {
    const { statusText } = await executeGraphql<ModuleStatus>(MODULE_STATUS_QUERY, {
      mock: 'module-status',
      resolveData: requireRootField('statusText'),
    });
    return statusText;
  } catch (error) {
    if (error instanceof WebApiError) return null;
    throw error;
  }
});
