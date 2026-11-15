import { CV_PAGE_MOCK } from './CvPage.mock';
import { NOT_FOUND_PAGE_MOCK } from './NotFoundPage.mock';
import { SIGN_IN_MOCK } from './SignIn.mock';
import { SITE_HEADER_MOCK } from './SiteHeader.mock';
import { STATUS_PAGE_MOCK } from './StatusPage.mock';

/**
 * Mock answers by mock key: a flat map, one entry per root field of the content queries.
 * Mock files hold plain data and import nothing; only `MockFallback.server.ts` loads this file.
 */
export const MOCK_VIEW = {
  ...CV_PAGE_MOCK,
  ...NOT_FOUND_PAGE_MOCK,
  ...SIGN_IN_MOCK,
  ...SITE_HEADER_MOCK,
  ...STATUS_PAGE_MOCK,
};

export type MockKey = keyof typeof MOCK_VIEW;
