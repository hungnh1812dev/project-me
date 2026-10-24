import { createApiContext } from '../../lib/create-api-context';
import type { ReviewerApi } from './reviewer.api';

export const [ReviewerApiProvider, useReviewerApi] =
  createApiContext<ReviewerApi>('Reviewer');
