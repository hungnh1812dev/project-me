import { createApiContext } from '../../lib/ApiContext.setup';
import type { ReviewerApi } from './reviewer.api';

export const [ReviewerApiProvider, useReviewerApi] =
  createApiContext<ReviewerApi>('Reviewer');
