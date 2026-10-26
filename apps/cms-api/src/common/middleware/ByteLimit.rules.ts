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
export function createByteCounter(
  maxBytes: number,
): (chunk: Buffer) => boolean {
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
