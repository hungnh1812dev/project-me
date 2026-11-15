import 'server-only';

import { cache } from 'react';

import { defineContentQuery, runContentQuery } from '@/apis/server/graphql/Graphql.server';
import { API_ERROR_CODES, API_ERROR_SOURCES, logApiError, WebApiError } from '@/apis/WebApi.errors';

import {
  SIGN_IN_OPERATION_NAME,
  SIGN_IN_ROOT_FIELDS,
  type SignIn,
  type SignInText,
} from './SignIn.graphql';

export const SIGN_IN_QUERY = defineContentQuery<SignIn>({
  operationName: SIGN_IN_OPERATION_NAME,
  rootFields: SIGN_IN_ROOT_FIELDS,
});

/** The sign-in dialog text; one request per render. `null` when it could not load (the header then shows no sign-in button). */
export const loadSignInText = cache(async (): Promise<SignInText | null> => {
  const { data, failedRootFields } = await runContentQuery(SIGN_IN_QUERY);
  if (failedRootFields.length === 0 && data.signInText) return data.signInText;
  logApiError(
    new WebApiError({
      source: API_ERROR_SOURCES.CMS_API_GRAPHQL,
      errorCode: API_ERROR_CODES.GRAPHQL.NO_DATA,
      operation: SIGN_IN_OPERATION_NAME,
    }),
  );
  return null;
});
