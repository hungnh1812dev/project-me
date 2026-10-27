import 'server-only';

import { cache } from 'react';

import { fetchGraphql } from '../../lib/Graphql.server';
import { sanitizeRichtextOnServer } from '../../lib/SafeRichtext.server';
import {
  CV_PAGE_DOCUMENT,
  type CvPageData,
  sanitizeCvRichtext,
} from './Cv.graphql';

/**
 * The public CV data with its richtext sanitized; one request per render even
 * if metadata and page both ask.
 */
export const loadCvPage = cache(async () =>
  sanitizeCvRichtext(
    await fetchGraphql<CvPageData>(CV_PAGE_DOCUMENT),
    sanitizeRichtextOnServer,
  ),
);
