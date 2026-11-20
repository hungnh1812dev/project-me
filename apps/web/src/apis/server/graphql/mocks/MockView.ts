import { MODULE_STATUS_MOCK } from './ModuleStatus.mock';
import { NOT_FOUND_PAGE_MOCK } from './NotFoundPage.mock';
import { PAGE_CV_MOCK } from './PageCv.mock';
import { SIGN_IN_MOCK } from './SignIn.mock';
import { SITE_HEADER_MOCK } from './SiteHeader.mock';

/**
 * Mock answers by mock key: one entry per query, each the GraphQL `data` of that query.
 * Mock files hold plain data and import nothing; only `MockFallback.server.ts` loads this file.
 */
export const MOCK_VIEW = {
  'site-header': SITE_HEADER_MOCK,
  'sign-in': SIGN_IN_MOCK,
  'not-found-page': NOT_FOUND_PAGE_MOCK,
  'module-status': MODULE_STATUS_MOCK,
  'page-cv-a': { pageCvA: PAGE_CV_MOCK.pageCvA },
  profile: { profile: PAGE_CV_MOCK.profile },
  'cv-common-text': { cvCommonText: PAGE_CV_MOCK.cvCommonText },
};

export type MockKey = keyof typeof MOCK_VIEW;
