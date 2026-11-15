import { notFound } from 'next/navigation';

import UnknownPathPage from './page';

vi.mock('next/navigation', () => ({
  notFound: vi.fn<typeof notFound>(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

describe('UnknownPathPage', () => {
  it('answers every unknown path with notFound()', () => {
    expect(() => UnknownPathPage()).toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalledOnce();
  });
});
