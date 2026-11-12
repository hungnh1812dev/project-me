import { MOCK_VIEW } from '../../web/src/apis/server/restful/mocks/MockView';

/**
 * The only file in the e2e suite that imports from an app's `src`. Specs import
 * these names from here, so a move or rename inside an app changes this file
 * only. Enforced by the `no-restricted-imports` rule in `eslint.config.mjs`.
 */
export { EN_TEXT as ADMIN_COPY } from '../../cms-admin/src/configs/locales/en';
export { API_ENDPOINTS } from '../../cms-admin/src/configs/Api.endpoints';
export { API_ERROR_CODES } from '../../cms-admin/src/configs/Http.constants';
export {
  APP_ROUTES,
  contentEditPath,
  contentListPath,
  contentNewPath,
} from '../../cms-admin/src/configs/App.routes';
export {
  CONTENT_LIST_PAGE_SIZE,
  PRESENCE_HEARTBEAT_MS,
} from '../../cms-admin/src/features/content/Content.constants';
export {
  MAX_FILES_PER_BATCH,
  MAX_PARALLEL_UPLOADS,
  MEDIA_ALT_MAX_LENGTH,
  MEDIA_DEFAULT_PAGE_SIZE,
  MEDIA_MAX_BYTES_BY_KIND,
} from '../../cms-admin/src/features/media/Media.constants';

const SHELL_MOCK =
  MOCK_VIEW.SiteShell as typeof import('../../web/src/apis/server/restful/mocks/SiteShell.mock').SITE_SHELL_MOCK;
const STATUS_MOCK =
  MOCK_VIEW.StatusPage as typeof import('../../web/src/apis/server/restful/mocks/StatusPage.mock').STATUS_PAGE_MOCK;
const CV_MOCK =
  MOCK_VIEW.CvPage as typeof import('../../web/src/apis/server/restful/mocks/CvPage.mock').CV_PAGE_MOCK;
const { twoFactor } = SHELL_MOCK.signInText;

/**
 * The web text on the stacks: the web mocks are the text (WEB-5). Plural and `{name}` placeholders
 * stay as written; the spec that needs one fills it. A field cms-api serves for real is read from the stack.
 */
export const WEB_COPY = {
  session: {
    signIn: SHELL_MOCK.header.author.btnLoginText,
    signOut: SHELL_MOCK.header.author.btnLogoutText,
    openCms: SHELL_MOCK.siteText.openCms,
    signOutFailed: SHELL_MOCK.siteText.signOutFailed,
  },
  login: {
    ...SHELL_MOCK.signInText,
    twoFactor: {
      ...twoFactor,
      errors: { invalidCode: twoFactor.invalidCode },
    },
  },
  cv: {
    maskedValue: CV_MOCK.cvPageText.maskedValue,
    refetchFailed: CV_MOCK.cvPageText.refetchFailed,
  },
  status: {
    checkAgain: STATUS_MOCK.statusPageText.checkAgain,
    state: { ok: STATUS_MOCK.statusPageText.stateOk },
  },
} as const;
