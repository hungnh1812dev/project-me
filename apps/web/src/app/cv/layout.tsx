import type { ReactNode } from 'react';

import { CV_ROBOTS_METADATA } from '@/views/cv/PageCv';

/** Puts the robots meta tag on every render under `/cv`, the not-found one included. */
export const metadata = CV_ROBOTS_METADATA;

export default function CvLayout({ children }: { children: ReactNode }) {
  return children;
}
