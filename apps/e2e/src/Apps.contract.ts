import { MODULE_STATUS_MOCK as STATUS_MOCK } from '../../web/src/apis/server/graphql/mocks/ModuleStatus.mock';
import { PAGE_CV_MOCK as CV_MOCK } from '../../web/src/apis/server/graphql/mocks/PageCv.mock';
import { SIGN_IN_MOCK } from '../../web/src/apis/server/graphql/mocks/SignIn.mock';
import { SITE_HEADER_MOCK } from '../../web/src/apis/server/graphql/mocks/SiteHeader.mock';

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

const { twoFactor } = SIGN_IN_MOCK.signInText;

/**
 * The web text on the stacks: the web mocks are the text (WEB-5). Plural and `{name}` placeholders
 * stay as written; the spec that needs one fills it. A field cms-api serves for real is read from the stack.
 */
export const WEB_COPY = {
  session: {
    signIn: SITE_HEADER_MOCK.header.author.btnLoginText,
    signOut: SITE_HEADER_MOCK.header.author.btnLogoutText,
    openCms: SIGN_IN_MOCK.signInText.openCms,
    signOutFailed: SIGN_IN_MOCK.signInText.signOutFailed,
  },
  login: {
    ...SIGN_IN_MOCK.signInText,
    twoFactor: {
      ...twoFactor,
      errors: { invalidCode: twoFactor.invalidCode },
    },
  },
  cv: {
    maskedValue: CV_MOCK.pageCvText.maskedValue,
    refetchFailed: CV_MOCK.pageCvText.refetchFailed,
  },
  status: {
    checkAgain: STATUS_MOCK.statusText.checkAgain,
    state: { ok: STATUS_MOCK.statusText.stateOk },
  },
} as const;
