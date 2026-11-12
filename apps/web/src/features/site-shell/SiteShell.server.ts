import 'server-only';

import { cache } from 'react';

import { GRAPHQL_FAILURE_CODES, GraphqlRequestError } from '@/apis/GraphqlResponse.rules';
import { defineContentQuery, runContentQuery } from '@/apis/server/graphql/Graphql.server';

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
  if (failedRootFields.length > 0) throw new GraphqlRequestError(GRAPHQL_FAILURE_CODES.NO_DATA);
  return data as SiteShell;
});
