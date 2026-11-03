import type { IncomingMessage, Server, ServerResponse } from 'node:http';

import type { Request, Response } from 'express';

/** True when the request announces a body over `maxBytes` (nothing is read). */
export function declaresBodyOver(req: Request, maxBytes: number): boolean {
  const declared = Number(req.headers['content-length']);
  return Number.isFinite(declared) && declared > maxBytes;
}

/**
 * Counts body bytes as chunks arrive; each call returns true once the total
 * passes `maxBytes`.
 */
export function createByteCounter(maxBytes: number): (chunk: Buffer) => boolean {
  let received = 0;
  return (chunk) => {
    received += chunk.length;
    return received > maxBytes;
  };
}

/** Stops reading a refused body and closes the socket once the answer is out. */
export function closeAfterAnswer(req: Request, res: Response): void {
  req.pause();
  res.once('finish', () => req.destroy());
}

const UNREAD_BODY_DISCARD_MAX_BYTES = 16 * 1024 * 1024;
const UNREAD_BODY_DISCARD_MAX_MS = 5000;

/**
 * After an early error answer to a request whose body was not read to the end
 * (rejected or refused upload), reads and discards the rest of the body so the
 * connection ends the request cleanly. A socket left mid-body would either reset
 * (closed with unread data) or stall the next request the proxy sends on that
 * kept-alive connection; both make the proxy answer 502. The socket stays open
 * meanwhile (no `Connection: close` from here, the proxy adds it for the client).
 * A body still arriving after the size or time cap is cut off.
 */
export function discardBodyAfterAnswer(req: Request, res: Response): void {
  res.once('finish', () => {
    let discarded = 0;
    const timer = setTimeout(() => req.destroy(), UNREAD_BODY_DISCARD_MAX_MS).unref();
    const stopTimer = () => clearTimeout(timer);
    req.once('end', stopTimer);
    req.once('close', stopTimer);
    req.on('data', (chunk: Buffer) => {
      discarded += chunk.length;
      if (discarded > UNREAD_BODY_DISCARD_MAX_BYTES) req.destroy();
    });
    req.resume();
  });
}

/**
 * Answers `Expect: 100-continue` only once the app starts reading the body, instead of
 * Node's default of sending `100 Continue` at once. A request refused before its body
 * is read (401/403/413 by declared length) then gets its final status without ever
 * inviting the body, so the client (or the proxy relaying it) never starts sending a
 * body that is closed under it. A body read by a consumer that never resumes the
 * stream still arrives: the proxy sends it after its own continue timeout.
 */
export function sendContinueWhenBodyIsRead(server: Server): void {
  server.on('checkContinue', (req: IncomingMessage, res: ServerResponse) => {
    req.once('resume', () => {
      if (!res.headersSent) res.writeContinue();
    });
    server.emit('request', req, res);
  });
}
