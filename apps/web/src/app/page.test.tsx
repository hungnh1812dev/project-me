import PageHome from '../views/home/PageHome';
import RoutePage from './page';

vi.mock('../views/home/PageHome', () => ({ default: vi.fn<() => null>() }));

describe('page route', () => {
  it('is the home page view and nothing else', () => {
    expect(RoutePage).toBe(PageHome);
  });
});
