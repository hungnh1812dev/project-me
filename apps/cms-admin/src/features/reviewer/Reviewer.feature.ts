import { defineApiService } from '@apis/client/ApiService.setup';

import type { Feature } from '../Features.registry';
import { createReviewerApi } from './Reviewer.api';
import { ReviewerApiProvider } from './ReviewerApi.context';

export const reviewerFeature: Feature = {
  apiServices: [defineApiService(createReviewerApi, ReviewerApiProvider)],
};
