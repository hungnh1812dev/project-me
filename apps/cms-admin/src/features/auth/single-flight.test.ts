import { deferred } from '../../../test/FakeApi.fixture';
import { singleFlight } from './single-flight';

describe('singleFlight', () => {
  it('shares one run between concurrent callers, then starts fresh', async () => {
    const gate = deferred<number>();
    const run = vi.fn<() => Promise<number>>(() => gate.promise);
    const shared = singleFlight(run);
    const a = shared();
    const b = shared();
    gate.resolve(7);
    expect(await Promise.all([a, b])).toEqual([7, 7]);
    expect(run).toHaveBeenCalledTimes(1);

    run.mockResolvedValueOnce(8);
    expect(await shared()).toBe(8);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('lets the next call retry after a failure', async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce('ok');
    const shared = singleFlight(run);
    await expect(shared()).rejects.toThrow('down');
    expect(await shared()).toBe('ok');
  });
});
