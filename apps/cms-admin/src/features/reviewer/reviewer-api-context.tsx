import { createContext, type ReactNode, use } from 'react';

import type { ReviewerApi } from './reviewer.api';

const ReviewerApiContext = createContext<ReviewerApi | null>(null);

export function ReviewerApiProvider({
  api,
  children,
}: {
  api: ReviewerApi;
  children: ReactNode;
}) {
  return <ReviewerApiContext value={api}>{children}</ReviewerApiContext>;
}

export function useReviewerApi(): ReviewerApi {
  const api = use(ReviewerApiContext);
  if (api === null) {
    throw new Error(
      'useReviewerApi must be used inside <ReviewerApiProvider>.',
    );
  }
  return api;
}
