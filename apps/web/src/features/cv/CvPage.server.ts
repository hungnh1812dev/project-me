import 'server-only';

import { cache } from 'react';

import { fetchGraphql } from '../../lib/Graphql.server';
import { CV_PAGE_DOCUMENT, type CvPageData } from './Cv.graphql';

/** The public CV data; one request per render even if metadata and page both ask. */
export const loadCvPage = cache(() =>
  fetchGraphql<CvPageData>(CV_PAGE_DOCUMENT),
);
