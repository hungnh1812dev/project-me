import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { requestGraphql } from '../../lib/Graphql.client';
import {
  GRAPHQL_FAILURE_CODES,
  GraphqlRequestError,
  isUnauthenticatedGraphqlError,
} from '../../lib/GraphqlResponse.rules';
import { useWebSession, type WebSession } from '../session';
import { sanitizeRichtext } from '../../lib/SafeRichtext.rules';
import {
  CV_PAGE_DOCUMENT,
  type CvPageData,
  sanitizeCvRichtext,
} from './Cv.graphql';

const ANONYMOUS_ACTOR = 'anonymous';

/** Who the data belongs to, so one actor's cache entry is never read by another. */
function actorKeyOf({ status, kind, user }: WebSession): string {
  return status === 'authenticated' && user !== null
    ? `${kind ?? 'account'}:${user.id}`
    : ANONYMOUS_ACTOR;
}

/**
 * The CV data for the current visitor. Anonymous visitors (and the first paint
 * of everyone) get the server-rendered data without a request; a signed-in or
 * reviewer session refetches with its own token, and signing out falls back to
 * the server data. A reviewer token the API no longer accepts (switch off,
 * 24 h expiry) ends the session the same way. The server data arrives sanitized; refetched data is
 * sanitized here.
 */
export function useCvContent(serverData: CvPageData) {
  const session = useWebSession();
  const actor = actorKeyOf(session);
  const isAnonymous = actor === ANONYMOUS_ACTOR;

  const query = useQuery({
    queryKey: ['cv', actor],
    queryFn: () => {
      const accessToken = session.getAccessToken();
      if (accessToken === null) {
        throw new GraphqlRequestError(GRAPHQL_FAILURE_CODES.UNKNOWN);
      }
      return requestGraphql<CvPageData>(
        CV_PAGE_DOCUMENT,
        undefined,
        accessToken,
      ).then((data) => sanitizeCvRichtext(data, sanitizeRichtext));
    },
    retry: false,
    ...(isAnonymous
      ? { initialData: serverData, staleTime: Infinity }
      : // Data read with a token is dropped as soon as nothing shows it.
        { gcTime: 0 }),
  });

  const isReviewerTokenRefused =
    session.kind === 'reviewer' && isUnauthenticatedGraphqlError(query.error);
  const { signOut } = session;
  useEffect(() => {
    if (isReviewerTokenRefused) void signOut();
  }, [isReviewerTokenRefused, signOut]);

  return query;
}
