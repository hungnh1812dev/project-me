import { notFound } from 'next/navigation';

import PageCvView, { CV_ROBOTS_METADATA, generateMetadata } from '@/views/cv/PageCv';

import CvRoute, { generateMetadata as routeGenerateMetadata } from './[documentId]/page';
import CvLayout, { metadata as layoutMetadata } from './layout';
import CvIndexPage from './page';

vi.mock('next/navigation', () => ({
  notFound: vi.fn<() => never>(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('@/views/cv/PageCv', () => ({
  default: function PageCv() {
    return null;
  },
  generateMetadata: vi.fn<() => object>(),
  CV_ROBOTS_METADATA: {
    robots: { index: false, follow: false, noarchive: true, nosnippet: true },
  },
}));

describe('/cv/[documentId] route', () => {
  it('renders only the page view', () => {
    expect(CvRoute).toBe(PageCvView);
  });

  it('re-exports the page view metadata', () => {
    expect(routeGenerateMetadata).toBe(generateMetadata);
  });
});

describe('/cv route', () => {
  it('is the not-found page, so no CV is listed', () => {
    expect(() => CvIndexPage()).toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });
});

describe('/cv layout', () => {
  it('carries the robots meta tag of every render under /cv and passes the children through', () => {
    expect(layoutMetadata).toBe(CV_ROBOTS_METADATA);
    expect(CvLayout({ children: 'child' })).toBe('child');
  });
});
