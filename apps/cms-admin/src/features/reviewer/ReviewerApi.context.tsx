import { createApiContext } from '../../lib/ApiContext.setup';
import type { ReviewerApi } from './Reviewer.api';

export const [ReviewerApiProvider, useReviewerApi] =
  createApiContext<ReviewerApi>('Reviewer');
