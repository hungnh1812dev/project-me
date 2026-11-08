import { SITE_SHELL_MOCK } from './SiteShell.mock';
import { STATUS_PAGE_MOCK } from './StatusPage.mock';

/** Mock answers by GraphQL operation name, then root field. Mock files hold plain data and import nothing. */
export type MockView = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

export const MOCK_VIEW: MockView = {
  SiteShell: SITE_SHELL_MOCK,
  StatusPage: STATUS_PAGE_MOCK,
};
