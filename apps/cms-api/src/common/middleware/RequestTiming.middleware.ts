import type { NextFunction, Request, Response } from 'express';

import type { AppLogger } from '../../infrastructure/logging/AppLogger.port';

/** A request slower than this many milliseconds is logged as a warning (API-1). */
export const SLOW_REQUEST_THRESHOLD_MS = 1000;

/** Log context of the request lines. */
export const REQUEST_LOG_CONTEXT = 'HTTP';

const NANOSECONDS_PER_MILLISECOND = 1_000_000n;

export interface RequestTimingOptions {
  readonly logger: AppLogger;
  /** Paths (and everything below them) that leave no line, such as the health probes. */
  readonly skippedPathPrefixes: readonly string[];
}

/**
 * API-1: one line per finished request, `<METHOD> <path> <status> <durationMs>ms`.
 * Logs nothing else (no query string, header, body, IP or account); a request
 * closed before `finish` leaves no line.
 */
export function createRequestTimingMiddleware({
  logger,
  skippedPathPrefixes,
}: RequestTimingOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const path = pathOf(req.originalUrl);
    if (isSkipped(path, skippedPathPrefixes)) {
      next();
      return;
    }
    const startedAt = process.hrtime.bigint();
    res.once('finish', () => {
      const durationMs = Number(
        (process.hrtime.bigint() - startedAt) / NANOSECONDS_PER_MILLISECOND,
      );
      const line = `${req.method} ${path} ${res.statusCode} ${durationMs}ms`;
      if (durationMs > SLOW_REQUEST_THRESHOLD_MS) {
        logger.warn(line, REQUEST_LOG_CONTEXT);
      } else {
        logger.info(line, REQUEST_LOG_CONTEXT);
      }
    });
    next();
  };
}

function pathOf(originalUrl: string): string {
  const queryStart = originalUrl.indexOf('?');
  return queryStart === -1 ? originalUrl : originalUrl.slice(0, queryStart);
}

function isSkipped(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
