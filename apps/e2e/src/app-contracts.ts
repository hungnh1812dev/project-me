/**
 * The only file in the e2e suite that imports from an app's `src`. Specs import
 * these names from here, so a move or rename inside an app changes this file
 * only. Enforced by the `no-restricted-imports` rule in `eslint.config.mjs`.
 */
export { COPY as ADMIN_COPY } from '../../cms-admin/src/config/copy.constants';
export { API_ENDPOINTS } from '../../cms-admin/src/config/endpoints';
export { API_ERROR_CODES } from '../../cms-admin/src/config/http.constants';
export {
  APP_ROUTES,
  contentListPath,
  contentNewPath,
} from '../../cms-admin/src/config/routes';
export {
  CONTENT_LIST_PAGE_SIZE,
  PRESENCE_HEARTBEAT_MS,
} from '../../cms-admin/src/features/content/content.constants';
export {
  MEDIA_ALT_MAX_LENGTH,
  MEDIA_PAGE_SIZE,
} from '../../cms-admin/src/features/media/media.constants';
export { COPY as WEB_COPY } from '../../web/src/config/copy.constants';
