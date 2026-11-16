import 'server-only';

import { cache } from 'react';

import { executeGraphql, requireRootField } from '@/apis/server/graphql/Graphql.server';
import { WebApiError } from '@/apis/WebApi.errors';

import { SIGN_IN_QUERY, type SignIn, type SignInText } from './SignIn.graphql';

/** The sign-in dialog text; one request per render. `null` when it could not load (the header then shows no sign-in button). */
export const loadSignInText = cache(async (): Promise<SignInText | null> => {
  try {
    const { signInText } = await executeGraphql<SignIn>(SIGN_IN_QUERY, {
      mock: 'sign-in',
      resolveData: requireRootField('signInText'),
    });
    return signInText;
  } catch (error) {
    if (error instanceof WebApiError) return null;
    throw error;
  }
});
