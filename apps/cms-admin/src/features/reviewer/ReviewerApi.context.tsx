import { createApiContext } from '@apis/client/ApiContext.setup';

import type { ReviewerApi } from './Reviewer.api';

export const [ReviewerApiProvider, useReviewerApi] = createApiContext<ReviewerApi>('Reviewer');
