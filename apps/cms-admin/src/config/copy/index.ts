import { ACCESS_COPY } from './access.copy';
import {
  APP_COPY,
  COMMON_COPY,
  NAV_COPY,
  PASSWORD_COPY,
  SESSION_COPY,
} from './common.copy';
import { CONTENT_COPY } from './content.copy';
import { LOGIN_COPY } from './login.copy';
import { MEDIA_COPY } from './media.copy';
import { REVIEWER_COPY } from './reviewer.copy';
import { SECURITY_COPY } from './security.copy';
import { SETUP_COPY } from './setup.copy';
import { PAGE_COPY, STATUS_COPY } from './status.copy';

/** User-facing text. One place until an i18n module exists; each section lives in its own `*.copy.ts`. */
export const COPY = {
  common: COMMON_COPY,
  app: APP_COPY,
  session: SESSION_COPY,
  login: LOGIN_COPY,
  setup: SETUP_COPY,
  password: PASSWORD_COPY,
  security: SECURITY_COPY,
  access: { nav: NAV_COPY, ...ACCESS_COPY },
  reviewer: REVIEWER_COPY,
  page: PAGE_COPY,
  status: STATUS_COPY,
  media: MEDIA_COPY,
  content: CONTENT_COPY,
} as const;
