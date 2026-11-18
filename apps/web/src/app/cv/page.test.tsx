import PageCvView, { generateMetadata } from '@/views/cv/PageCv';

import CvRoute, { generateMetadata as routeGenerateMetadata } from './page';

vi.mock('@/views/cv/PageCv', () => ({
  default: function PageCv() {
    return null;
  },
  generateMetadata: vi.fn<() => object>(),
}));

describe('/cv route', () => {
  it('renders only the page view', () => {
    expect(CvRoute).toBe(PageCvView);
  });

  it('re-exports the page view metadata', () => {
    expect(routeGenerateMetadata).toBe(generateMetadata);
  });
});
