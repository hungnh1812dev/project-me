import { APP_ROUTES } from '@configs/App.routes';
import { COPY } from '@configs/Copy.constants';
import { defineApiService, type Feature } from '@libs/FeatureDefinition';

import { createReviewerApi } from './Reviewer.api';
import { REVIEWER_SETTINGS_SUBJECT } from './Reviewer.constants';
import { ReviewerApiProvider } from './ReviewerApi.context';
import { ReviewerSessionsPage } from './ReviewerSessionsPage';

export const reviewerFeature: Feature = {
  apiServices: [defineApiService(createReviewerApi, ReviewerApiProvider)],
  routes: [{ path: APP_ROUTES.REVIEWER_SESSIONS, Component: ReviewerSessionsPage }],
  navItems: [
    {
      label: COPY.access.nav.reviewer,
      path: APP_ROUTES.REVIEWER_SESSIONS,
      section: 'systemSettings',
      subject: REVIEWER_SETTINGS_SUBJECT,
      action: 'read',
    },
  ],
};
