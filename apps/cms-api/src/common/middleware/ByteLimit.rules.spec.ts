import { EventEmitter } from 'node:events';

import type { Request, Response } from 'express';

import {
  closeAfterAnswer,
  createByteCounter,
  declaresBodyOver,
} from './ByteLimit.rules';

const requestWith = (contentLength?: string): Request =>
  ({
    headers:
      contentLength === undefined ? {} : { 'content-length': contentLength },
  }) as unknown as Request;

describe('byte-limit', () => {
  it('flags only a declared length over the limit', () => {
    expect(declaresBodyOver(requestWith('10'), 10)).toBe(false);
    expect(declaresBodyOver(requestWith('11'), 10)).toBe(true);
    expect(declaresBodyOver(requestWith(), 10)).toBe(false);
    expect(declaresBodyOver(requestWith('abc'), 10)).toBe(false);
  });

  it('counts chunks and reports once the total passes the limit', () => {
    const exceedsLimit = createByteCounter(4);
    expect(exceedsLimit(Buffer.alloc(3))).toBe(false);
    expect(exceedsLimit(Buffer.alloc(1))).toBe(false);
    expect(exceedsLimit(Buffer.alloc(1))).toBe(true);
  });

  it('pauses the body and destroys the socket after the answer', () => {
    const req = { pause: jest.fn(), destroy: jest.fn() };
    const res = new EventEmitter();
    closeAfterAnswer(req as unknown as Request, res as unknown as Response);
    expect(req.pause).toHaveBeenCalled();
    expect(req.destroy).not.toHaveBeenCalled();
    res.emit('finish');
    expect(req.destroy).toHaveBeenCalled();
  });
});
