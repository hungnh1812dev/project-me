import { EventEmitter } from 'node:events';

import type { NextFunction, Request, Response } from 'express';

import type { AppLogger } from '../../infrastructure/logging/AppLogger.port';
import {
  createRequestTimingMiddleware,
  REQUEST_LOG_CONTEXT,
  SLOW_REQUEST_THRESHOLD_MS,
} from './RequestTiming.middleware';

const NS_PER_MS = 1_000_000n;

describe('createRequestTimingMiddleware', () => {
  let info: jest.Mock;
  let warn: jest.Mock;
  let logger: AppLogger;
  let clockMs: bigint;
  const middleware = () =>
    createRequestTimingMiddleware({ logger, skippedPathPrefixes: ['/api/v1/health'] });

  beforeEach(() => {
    info = jest.fn();
    warn = jest.fn();
    logger = { info, warn, error: jest.fn() };
    clockMs = 0n;
    jest.spyOn(process.hrtime, 'bigint').mockImplementation(() => clockMs * NS_PER_MS);
  });
  afterEach(() => jest.restoreAllMocks());

  function run(url: string, durationMs: number, event: 'finish' | 'close' = 'finish') {
    const res = Object.assign(new EventEmitter(), { statusCode: 200 }) as unknown as Response;
    const next = jest.fn() as NextFunction;
    middleware()({ method: 'GET', originalUrl: url } as Request, res, next);
    clockMs += BigInt(durationMs);
    res.emit(event);
    res.emit(event);
    return next;
  }

  it('logs one info line with method, path, status and duration', () => {
    const next = run('/api/v1/documents/cv-page', 14);
    expect(next).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(
      'GET /api/v1/documents/cv-page 200 14ms',
      REQUEST_LOG_CONTEXT,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('cuts the query string and does not decode the path', () => {
    run('/api/v1/a%20b?token=secret', 1);
    expect(info).toHaveBeenCalledWith('GET /api/v1/a%20b 200 1ms', REQUEST_LOG_CONTEXT);
  });

  it('logs info at the threshold and warn above it', () => {
    run('/api/v1/x', SLOW_REQUEST_THRESHOLD_MS);
    expect(info).toHaveBeenCalledTimes(1);
    run('/api/v1/x', SLOW_REQUEST_THRESHOLD_MS + 1);
    expect(warn).toHaveBeenCalledWith(
      `GET /api/v1/x 200 ${SLOW_REQUEST_THRESHOLD_MS + 1}ms`,
      REQUEST_LOG_CONTEXT,
    );
  });

  it.each(['/api/v1/health', '/api/v1/health/', '/api/v1/health/live', '/api/v1/health/ready?a=1'])(
    'skips %s',
    (url) => {
      const next = run(url, 5);
      expect(next).toHaveBeenCalledTimes(1);
      expect(info).not.toHaveBeenCalled();
    },
  );

  it.each(['/api/v1/healthz', '/api/v1/healthy/live'])('does not skip %s', (url) => {
    run(url, 5);
    expect(info).toHaveBeenCalledTimes(1);
  });

  it('leaves no line for a request closed before finish', () => {
    run('/api/v1/x', 5, 'close');
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
