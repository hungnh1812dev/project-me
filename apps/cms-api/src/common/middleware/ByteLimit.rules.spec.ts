import { EventEmitter, once } from 'node:events';
import { createServer, request, type Server } from 'node:http';
import { connect, type AddressInfo } from 'node:net';

import type { Request, Response } from 'express';

import {
  closeAfterAnswer,
  createByteCounter,
  declaresBodyOver,
  discardBodyAfterAnswer,
  sendContinueWhenBodyIsRead,
} from './ByteLimit.rules';

const requestWith = (contentLength?: string): Request =>
  ({
    headers: contentLength === undefined ? {} : { 'content-length': contentLength },
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

  describe('discardBodyAfterAnswer', () => {
    function drainingRequest() {
      const req = new EventEmitter() as EventEmitter & { resume: jest.Mock; destroy: jest.Mock };
      req.resume = jest.fn();
      req.destroy = jest.fn();
      const res = new EventEmitter();
      discardBodyAfterAnswer(req as unknown as Request, res as unknown as Response);
      return { req, res };
    }

    it('keeps the socket open until the answer is out, then discards the body', () => {
      const { req, res } = drainingRequest();
      expect(req.resume).not.toHaveBeenCalled();
      res.emit('finish');
      expect(req.resume).toHaveBeenCalled();
      req.emit('data', Buffer.alloc(10));
      expect(req.destroy).not.toHaveBeenCalled();
      req.emit('end');
      expect(req.destroy).not.toHaveBeenCalled();
    });

    it('destroys the socket once the discarded body passes the cap', () => {
      const { req, res } = drainingRequest();
      res.emit('finish');
      req.emit('data', Buffer.alloc(32 * 1024 * 1024));
      expect(req.destroy).toHaveBeenCalled();
    });

    it('destroys the socket when the body stalls past the time cap', () => {
      jest.useFakeTimers();
      try {
        const { req, res } = drainingRequest();
        res.emit('finish');
        jest.advanceTimersByTime(5500);
        expect(req.destroy).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
    describe('on a real kept-alive connection', () => {
      const BODY_BYTES = 4 * 1024 * 1024;
      const READ_BEFORE_REFUSAL_BYTES = 1024 * 1024;
      const ANSWER_WAIT_MS = 2000;
      let server: Server;

      beforeAll(async () => {
        server = createServer((req, res) => {
          if (req.url === '/next') {
            res.end('ok');
            return;
          }
          // Reads part of the body, then refuses it mid-upload, as the upload parser does.
          let read = 0;
          const onData = (chunk: Buffer) => {
            read += chunk.length;
            if (read < READ_BEFORE_REFUSAL_BYTES) return;
            req.removeListener('data', onData);
            req.pause();
            discardBodyAfterAnswer(req as Request, res as Response);
            res.statusCode = 413;
            res.end();
          };
          req.on('data', onData);
        });
        server.listen(0);
        await once(server, 'listening');
      });

      afterAll(() => {
        server.closeAllConnections();
        server.close();
      });

      it('answers the next request sent on the connection after a refused body', async () => {
        const socket = connect((server.address() as AddressInfo).port);
        let received = '';
        socket.on('data', (data: Buffer) => {
          received += data.toString('latin1');
        });
        socket.write(`POST /upload HTTP/1.1\r\nHost: t\r\nContent-Length: ${BODY_BYTES}\r\n\r\n`);
        socket.write(Buffer.alloc(BODY_BYTES));
        socket.write('GET /next HTTP/1.1\r\nHost: t\r\n\r\n');

        const deadline = Date.now() + ANSWER_WAIT_MS;
        while (!received.includes('HTTP/1.1 200') && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        socket.destroy();
        expect(received.match(/HTTP\/1\.1 \d{3}/g)).toEqual(['HTTP/1.1 413', 'HTTP/1.1 200']);
      });
    });
  });

  describe('sendContinueWhenBodyIsRead', () => {
    let server: Server;

    beforeAll(async () => {
      server = createServer((req, res) => {
        if (req.url === '/refused') {
          res.statusCode = 403;
          res.end();
          return;
        }
        req.on('end', () => res.end('read'));
        req.resume();
      });
      sendContinueWhenBodyIsRead(server);
      server.listen(0);
      await once(server, 'listening');
    });

    afterAll(() => {
      server.closeAllConnections();
      server.close();
    });

    function postExpectingContinue(path: string) {
      return new Promise<{ status: number | undefined; gotContinue: boolean }>(
        (resolve, reject) => {
          let gotContinue = false;
          const req = request({
            port: (server.address() as AddressInfo).port,
            method: 'POST',
            path,
            headers: { Expect: '100-continue', 'Content-Length': '4' },
          });
          req.on('continue', () => {
            gotContinue = true;
            req.end('body');
          });
          req.on('response', (res) => {
            res.resume();
            resolve({ status: res.statusCode, gotContinue });
          });
          req.on('error', reject);
          req.flushHeaders();
        },
      );
    }

    it('answers a request refused before its body is read without 100 Continue', async () => {
      await expect(postExpectingContinue('/refused')).resolves.toEqual({
        status: 403,
        gotContinue: false,
      });
    });

    it('sends 100 Continue once the handler reads the body', async () => {
      await expect(postExpectingContinue('/read')).resolves.toEqual({
        status: 200,
        gotContinue: true,
      });
    });
  });
});
