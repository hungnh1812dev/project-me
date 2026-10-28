import { ACCESS_COPY } from './Access.copy';
import {
  APP_COPY,
  COMMON_COPY,
  NAV_COPY,
  PASSWORD_COPY,
  SESSION_COPY,
} from './Common.copy';
import { BACKUPS_COPY } from './Backups.copy';
import { CONTENT_COPY } from './Content.copy';
import { LOGIN_COPY } from './Login.copy';
import { MEDIA_COPY } from './Media.copy';
import { REVIEWER_COPY } from './Reviewer.copy';
import { SECURITY_COPY } from './Security.copy';
import { SETUP_COPY } from './Setup.copy';
import { PAGE_COPY, STATUS_COPY } from './Status.copy';

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
  backups: BACKUPS_COPY,
} as const;
