/** What a recurring in-process job needs; the owner module supplies all three. */
export interface IntervalJobOptions {
  readonly intervalMs: number;
  /** One run. A rejection goes to `onError`; the next tick still happens. */
  readonly run: () => Promise<unknown>;
  readonly onError: (error: unknown) => void;
}

/**
 * Runs `run` every `intervalMs` until the returned function is called. The
 * timer is unref'd, so it never keeps the process alive. Overlap is the job's
 * concern: with several replicas every one runs it.
 */
export function startIntervalJob(options: IntervalJobOptions): () => void {
  const timer = setInterval(() => {
    void options.run().catch(options.onError);
  }, options.intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
