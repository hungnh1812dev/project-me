import { REVIEWER_SETTINGS_SUBJECT } from '../../config/reviewer.constants';
import { COPY } from '../../config/copy.constants';
import { APP_ROUTES } from '../../config/routes';
import type { Feature } from '../../lib/feature-definition';
import { ReviewerSessionsPage } from './ReviewerSessionsPage';

export const reviewerFeature: Feature = {
  routes: [
    { path: APP_ROUTES.REVIEWER_SESSIONS, Component: ReviewerSessionsPage },
  ],
  navItems: [
    {
      label: COPY.access.nav.reviewer,
      path: APP_ROUTES.REVIEWER_SESSIONS,
      subject: REVIEWER_SETTINGS_SUBJECT,
      action: 'read',
    },
  ],
};
