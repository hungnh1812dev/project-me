import { EventEmitter } from 'node:events';

import type { NextFunction, Response } from 'express';

import type { RequestWithId } from '../../../common/middleware/RequestId.middleware';
import { GRAPHQL_LIMITS } from '../application/Graphql.constants';
import { graphqlBodyLimit } from './GraphqlBodyLimit.middleware';

function fake(method: string, contentLength?: number) {
  const req = Object.assign(new EventEmitter(), {
    method,
    headers:
      contentLength === undefined
        ? {}
        : { 'content-length': String(contentLength) },
    requestId: 'rid',
    destroy: jest.fn(),
    pause: jest.fn(),
  });
  const res = Object.assign(new EventEmitter(), {
    headersSent: false,
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    json: jest.fn().mockImplementation(function (this: {
      headersSent: boolean;
    }) {
      this.headersSent = true;
    }),
  });
  const next = jest.fn();
  graphqlBodyLimit(
    req as unknown as RequestWithId,
    res as unknown as Response,
    next as NextFunction,
  );
  return { req, res, next };
}

describe('graphqlBodyLimit', () => {
  it('lets a body at the limit through', () => {
    const { next, res } = fake('POST', GRAPHQL_LIMITS.MAX_BODY_BYTES);
    expect(next).toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('refuses a declared length over the limit with a GraphQL-shaped 413', () => {
    const { next, res } = fake('POST', GRAPHQL_LIMITS.MAX_BODY_BYTES + 1);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      errors: [
        {
          message: expect.any(String) as string,
          extensions: { code: 'PAYLOAD_TOO_LARGE', requestId: 'rid' },
        },
      ],
    });
  });

  it('counts a chunked body and answers once when it passes the limit', () => {
    const { req, res, next } = fake('POST');
    expect(next).toHaveBeenCalled();
    req.emit('data', Buffer.alloc(GRAPHQL_LIMITS.MAX_BODY_BYTES));
    expect(res.json).not.toHaveBeenCalled();
    req.emit('data', Buffer.alloc(1));
    req.emit('data', Buffer.alloc(1));
    expect(res.json).toHaveBeenCalledTimes(1);
    // The parser's listeners are gone and the stream is paused: it can never call next().
    expect(req.listenerCount('data')).toBe(0);
    expect(req.listenerCount('end')).toBe(0);
    expect(req.pause).toHaveBeenCalled();
    res.emit('finish');
    expect(req.destroy).toHaveBeenCalled();
  });

  it('ignores other methods', () => {
    const { next, res } = fake('GET', GRAPHQL_LIMITS.MAX_BODY_BYTES * 10);
    expect(next).toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
