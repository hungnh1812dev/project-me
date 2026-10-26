import { REVIEWER_SETTINGS_SUBJECT } from './reviewer.constants';
import { COPY } from '../../config/Copy.constants';
import { APP_ROUTES } from '../../config/App.routes';
import { defineApiService, type Feature } from '../../lib/FeatureDefinition';
import { ReviewerApiProvider } from './reviewer-api-context';
import { createReviewerApi } from './reviewer.api';
import { ReviewerSessionsPage } from './ReviewerSessionsPage';

export const reviewerFeature: Feature = {
  apiServices: [defineApiService(createReviewerApi, ReviewerApiProvider)],
  routes: [
    { path: APP_ROUTES.REVIEWER_SESSIONS, Component: ReviewerSessionsPage },
  ],
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
