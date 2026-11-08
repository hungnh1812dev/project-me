import { CV_PAGE_MOCK } from './CvPage.mock';
import { SITE_SHELL_MOCK } from './SiteShell.mock';
import { STATUS_PAGE_MOCK } from './StatusPage.mock';

/** Mock answers by GraphQL operation name, then root field. Mock files hold plain data and import nothing. */
export type MockView = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

export const MOCK_VIEW: MockView = {
  CvPage: CV_PAGE_MOCK,
  SiteShell: SITE_SHELL_MOCK,
  StatusPage: STATUS_PAGE_MOCK,
};
