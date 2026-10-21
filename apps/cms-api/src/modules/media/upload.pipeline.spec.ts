import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { stat } from 'node:fs/promises';

import { HttpException } from '@nestjs/common';
import sharp from 'sharp';

import {
  buildMediaFixtures,
  EXIF_MARKER,
  HTML_DOCUMENT,
  type MediaFixtures,
  MINIMAL_MP4,
  MINIMAL_PDF,
  SVG_DOCUMENT,
} from '../../../test/fixtures/media.fixture';
import { multipart } from '../../../test/fixtures/multipart';
import {
  FALLBACK_FILE_NAME,
  FILE_NAME_MAX_LENGTH,
  MEDIA_ERROR_CODES,
  MEDIA_MAX_BYTES,
} from './media.constants';
import {
  type PreparedUpload,
  sanitizeFileName,
  UploadPipeline,
} from './upload.pipeline';

type Part = Parameters<typeof multipart>[0][number];

function requestOf(
  parts: readonly Part[],
  headers: Record<string, string> = {},
): IncomingMessage {
  const { body, contentType } = multipart(parts);
  const req = Readable.from([body]) as unknown as IncomingMessage;
  req.headers = { 'content-type': contentType, ...headers };
  return req;
}

const fileOf = (
  data: Buffer,
  fileName = 'photo.jpg',
  field = 'file',
): Part => ({
  field,
  fileName,
  data,
  contentType: 'image/jpeg',
});

async function statusOf(promise: Promise<unknown>): Promise<{
  status: number;
  code: unknown;
}> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpException) {
      const body = error.getResponse() as { errorCode?: unknown };
      return { status: error.getStatus(), code: body.errorCode };
    }
    throw error;
  }
  throw new Error('expected the pipeline to refuse the upload');
}

async function bytesOf(prepared: PreparedUpload): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of prepared.open()) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

describe('sanitizeFileName', () => {
  it.each([
    ['photo.jpg', 'photo.jpg'],
    ['../../etc/passwd', 'passwd'],
    ['C:\\Users\\me\\cv.pdf', 'cv.pdf'],
    ['a\u0000b\nc.png', 'abc.png'],
    ['', FALLBACK_FILE_NAME],
    ['..', FALLBACK_FILE_NAME],
    ['dir/', FALLBACK_FILE_NAME],
  ])('%j -> %j', (input, expected) => {
    expect(sanitizeFileName(input)).toBe(expected);
  });

  it('bounds the length', () => {
    expect(Array.from(sanitizeFileName('x'.repeat(1_000))).length).toBe(
      FILE_NAME_MAX_LENGTH,
    );
  });
});

describe('UploadPipeline (SPEC D12, §12-13)', () => {
  const pipeline = new UploadPipeline();
  let fixtures: MediaFixtures;

  beforeAll(async () => {
    fixtures = await buildMediaFixtures();
  });

  async function receiveAndPrepare(parts: readonly Part[]) {
    const received = await pipeline.receive(requestOf(parts));
    try {
      return { received, prepared: await pipeline.prepare(received) };
    } finally {
      await received.dispose();
    }
  }

  it('strips EXIF and GPS from a JPEG and hashes the stored bytes', async () => {
    expect(fixtures.exifJpeg.includes(Buffer.from(EXIF_MARKER))).toBe(true);
    const received = await pipeline.receive(
      requestOf([
        fileOf(fixtures.exifJpeg),
        { field: 'alt', value: ' A red box ' },
      ]),
    );
    try {
      expect(received.alt).toBe('A red box');
      expect(received.fileName).toBe('photo.jpg');
      const prepared = await pipeline.prepare(received);
      const stored = await bytesOf(prepared);
      expect(stored.includes(Buffer.from(EXIF_MARKER))).toBe(false);
      const meta = await sharp(stored).metadata();
      expect(meta.exif).toBeUndefined();
      expect(prepared).toMatchObject({
        mimeType: 'image/jpeg',
        kind: 'image',
        width: 8,
        height: 4,
        size: stored.length,
      });
      expect(prepared.sha256).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await received.dispose();
    }
  });

  it('drops the HTML appended to a polyglot JPEG', async () => {
    const { prepared } = await receiveAndPrepare([
      fileOf(fixtures.polyglotJpeg),
    ]);
    const stored = await bytesOf(prepared);
    expect(stored.includes(Buffer.from('<script>'))).toBe(false);
  });

  it.each([
    ['png', 'image/png'],
    ['webp', 'image/webp'],
    ['gif', 'image/gif'],
    ['avif', 'image/avif'],
  ] as const)('re-encodes %s and keeps its type', async (name, mime) => {
    const { prepared } = await receiveAndPrepare([
      fileOf(fixtures[name], `x.${name}`),
    ]);
    expect(prepared.mimeType).toBe(mime);
    expect(prepared.width).toBe(6);
  });

  it('detects the type from the bytes, not the name or declared type', async () => {
    const { prepared } = await receiveAndPrepare([
      fileOf(fixtures.png, 'looks-like.pdf'),
    ]);
    expect(prepared.mimeType).toBe('image/png');
  });

  it('stores pdf and mp4 as received, with their own hash', async () => {
    const pdf = await receiveAndPrepare([fileOf(MINIMAL_PDF, 'cv.pdf')]);
    expect(pdf.prepared).toMatchObject({
      mimeType: 'application/pdf',
      kind: 'pdf',
      size: MINIMAL_PDF.length,
      width: null,
    });
    const mp4 = await receiveAndPrepare([fileOf(MINIMAL_MP4, 'clip.mp4')]);
    expect(mp4.prepared).toMatchObject({
      mimeType: 'video/mp4',
      kind: 'video',
    });
  });

  it('serves the stored bytes of a pdf from the temp file during the call', async () => {
    const received = await pipeline.receive(
      requestOf([fileOf(MINIMAL_PDF, 'cv.pdf')]),
    );
    try {
      const prepared = await pipeline.prepare(received);
      expect((await bytesOf(prepared)).equals(MINIMAL_PDF)).toBe(true);
    } finally {
      await received.dispose();
    }
    await expect(stat(received.path)).rejects.toThrow(/ENOENT/);
  });

  it.each([
    ['html renamed to .jpg', HTML_DOCUMENT, 'a.jpg'],
    ['svg', SVG_DOCUMENT, 'a.svg'],
    ['svg renamed to .png', SVG_DOCUMENT, 'a.png'],
    ['plain text', Buffer.from('hello'), 'a.txt'],
    ['an empty file', Buffer.alloc(0), 'a.jpg'],
  ])('refuses %s with 415', async (_name, data, fileName) => {
    expect(
      await statusOf(pipeline.receive(requestOf([fileOf(data, fileName)]))),
    ).toEqual({ status: 415, code: MEDIA_ERROR_CODES.UNSUPPORTED_TYPE });
  });

  it('refuses a JPEG that does not decode with 415', async () => {
    const received = await pipeline.receive(
      requestOf([fileOf(fixtures.brokenJpeg)]),
    );
    try {
      expect(await statusOf(pipeline.prepare(received))).toEqual({
        status: 415,
        code: MEDIA_ERROR_CODES.UNSUPPORTED_TYPE,
      });
    } finally {
      await received.dispose();
    }
  });

  it('refuses a file over the limit of its type with 413 while streaming', async () => {
    const oversizedPdf = Buffer.concat([
      MINIMAL_PDF,
      Buffer.alloc(MEDIA_MAX_BYTES.pdf, 0x20),
    ]);
    expect(
      await statusOf(
        pipeline.receive(requestOf([fileOf(oversizedPdf, 'big.pdf')])),
      ),
    ).toEqual({ status: 413, code: MEDIA_ERROR_CODES.FILE_TOO_LARGE });
  });

  it('refuses a request whose declared length is far over the cap with 413', async () => {
    const req = requestOf([fileOf(fixtures.png)], {
      'content-length': String(10 ** 10),
    });
    expect((await statusOf(pipeline.receive(req))).status).toBe(413);
  });

  it.each([
    ['no file', [{ field: 'alt', value: 'x' }]],
    ['a file in the wrong field', [fileOf(MINIMAL_PDF, 'a.pdf', 'upload')]],
    ['two files', [fileOf(MINIMAL_PDF, 'a.pdf'), fileOf(MINIMAL_PDF, 'b.pdf')]],
    [
      'an unknown field',
      [{ field: 'folder', value: 'x' }, fileOf(MINIMAL_PDF, 'a.pdf')],
    ],
    [
      'an alt text over the limit',
      [{ field: 'alt', value: 'x'.repeat(501) }, fileOf(MINIMAL_PDF, 'a.pdf')],
    ],
  ] as const)('refuses %s with 400', async (_name, parts) => {
    expect(await statusOf(pipeline.receive(requestOf(parts)))).toEqual({
      status: 400,
      code: MEDIA_ERROR_CODES.INVALID_UPLOAD,
    });
  });

  it('refuses a body that is not multipart with 415', async () => {
    const req = Readable.from([
      Buffer.from('{}'),
    ]) as unknown as IncomingMessage;
    req.headers = { 'content-type': 'application/json' };
    expect((await statusOf(pipeline.receive(req))).status).toBe(415);
  });
});
