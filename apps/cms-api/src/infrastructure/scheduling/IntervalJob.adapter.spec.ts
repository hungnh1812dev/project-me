import { startIntervalJob } from './IntervalJob.adapter';

describe('startIntervalJob', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('runs every interval until stopped', async () => {
    const run = jest.fn(() => Promise.resolve());
    const stop = startIntervalJob({
      intervalMs: 1_000,
      run,
      onError: jest.fn(),
    });
    await jest.advanceTimersByTimeAsync(3_000);
    expect(run).toHaveBeenCalledTimes(3);
    stop();
    await jest.advanceTimersByTimeAsync(3_000);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('reports a failed run and keeps ticking', async () => {
    const failure = new Error('boom');
    const run = jest.fn(() => Promise.reject(failure));
    const onError = jest.fn();
    const stop = startIntervalJob({ intervalMs: 1_000, run, onError });
    await jest.advanceTimersByTimeAsync(2_000);
    stop();
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith(failure);
  });
});
