import { ACCESS_COPY } from './Access';
import { BACKUPS_COPY } from './Backups';
import { APP_COPY, COMMON_COPY, NAV_COPY, PASSWORD_COPY, SESSION_COPY } from './Common';
import { CONTENT_COPY } from './Content';
import { LOGIN_COPY } from './Login';
import { MEDIA_COPY } from './Media';
import { REVIEWER_COPY } from './Reviewer';
import { SCHEMA_BUILDER_COPY } from './SchemaBuilder';
import { SECURITY_COPY } from './Security';
import { SETUP_COPY } from './Setup';
import { PAGE_COPY, STATUS_COPY } from './Status';

/** User-facing English text as one tree, for tests and e2e; product code loads one screen at a time through `@configs/locales`. */
export const EN_TEXT = {
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
  schemaBuilder: SCHEMA_BUILDER_COPY,
} as const;
