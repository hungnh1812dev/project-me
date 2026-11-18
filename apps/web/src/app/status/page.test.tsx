import PageStatus from '../../views/status/PageStatus';
import RoutePage from './page';

vi.mock('../../views/status/PageStatus', () => ({ default: vi.fn<() => null>() }));

describe('status/page route', () => {
  it('is the status page view and nothing else', () => {
    expect(RoutePage).toBe(PageStatus);
  });
});
