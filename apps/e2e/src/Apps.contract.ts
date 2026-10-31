/**
 * The only file in the e2e suite that imports from an app's `src`. Specs import
 * these names from here, so a move or rename inside an app changes this file
 * only. Enforced by the `no-restricted-imports` rule in `eslint.config.mjs`.
 */
export { COPY as ADMIN_COPY } from '../../cms-admin/src/configs/Copy.constants';
export { API_ENDPOINTS } from '../../cms-admin/src/configs/Api.endpoints';
export { API_ERROR_CODES } from '../../cms-admin/src/configs/Http.constants';
export {
  APP_ROUTES,
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
export { COPY as WEB_COPY } from '../../web/src/configs/Copy.constants';
