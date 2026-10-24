import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, open, readFile, rm } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import busboy from 'busboy';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';

import type { MediaKind } from '../../infrastructure/media/media.constants';
import {
  ALT_MAX_BYTES,
  ALT_MAX_LENGTH,
  type AllowedMime,
  allowedMediaTypeOf,
  FALLBACK_FILE_NAME,
  FILE_NAME_MAX_LENGTH,
  type ImageMime,
  IMAGE_QUALITY,
  MAX_IMAGE_PIXELS,
  MEDIA_ERROR_CODES,
  MEDIA_ERROR_MESSAGES,
  MEDIA_MAX_BYTES,
  MEDIA_MAX_FILE_BYTES,
  MEDIA_MAX_REQUEST_BYTES,
  SNIFF_BYTES,
  UPLOAD_FIELDS,
  UPLOAD_MAX_PARTS,
  UPLOAD_TEMP_PREFIX,
} from './media.constants';

/** A file received and written to a temp file; nothing trusted yet except the detected type. */
export interface ReceivedUpload {
  readonly fileName: string;
  readonly alt: string | null;
  readonly mimeType: AllowedMime;
  readonly kind: MediaKind;
  readonly path: string;
  readonly size: number;
  /** SHA-256 of the received bytes (used as-is for pdf and video). */
  readonly sha256: string;
  /** Deletes the temp file; always call it. */
  dispose(): Promise<void>;
}

/** Bytes ready to store: images re-encoded, others as received. */
export interface PreparedUpload {
  readonly mimeType: AllowedMime;
  readonly kind: MediaKind;
  readonly size: number;
  readonly sha256: string;
  readonly width: number | null;
  readonly height: number | null;
  /** A fresh stream of the bytes to store. */
  open(): Readable;
}

type ImageEncoder = (image: sharp.Sharp) => Promise<Buffer>;

/** One re-encoder per allowlisted image type; adding an image MIME fails to compile until it has one. */
const IMAGE_ENCODERS: Record<ImageMime, ImageEncoder> = {
  'image/jpeg': (image) => image.jpeg({ quality: IMAGE_QUALITY }).toBuffer(),
  'image/png': (image) => image.png().toBuffer(),
  'image/webp': (image) => image.webp({ quality: IMAGE_QUALITY }).toBuffer(),
  'image/gif': (image) => image.gif().toBuffer(),
  'image/avif': (image) => image.avif({ quality: IMAGE_QUALITY }).toBuffer(),
};

function imageEncoderOf(mimeType: string): ImageEncoder | undefined {
  return Object.hasOwn(IMAGE_ENCODERS, mimeType)
    ? IMAGE_ENCODERS[mimeType as ImageMime]
    : undefined;
}

function unsupportedType(message: string): HttpException {
  return new HttpException(
    {
      errorCode: MEDIA_ERROR_CODES.UNSUPPORTED_TYPE,
      message,
    },
    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  );
}

function tooLarge(): HttpException {
  return new HttpException(
    {
      errorCode: MEDIA_ERROR_CODES.FILE_TOO_LARGE,
      message: MEDIA_ERROR_MESSAGES.FILE_TOO_LARGE,
    },
    HttpStatus.PAYLOAD_TOO_LARGE,
  );
}

function invalidUpload(message: string): BadRequestException {
  return new BadRequestException({
    errorCode: MEDIA_ERROR_CODES.INVALID_UPLOAD,
    message,
  });
}

/**
 * Client file name reduced to a safe display name: no path, no control
 * characters, bounded length. It is never used as a storage key.
 */
export function sanitizeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const bounded = Array.from(cleaned).slice(0, FILE_NAME_MAX_LENGTH).join('');
  return bounded === '' || bounded === '.' || bounded === '..'
    ? FALLBACK_FILE_NAME
    : bounded;
}

interface Spooled {
  readonly mimeType: AllowedMime;
  readonly kind: MediaKind;
  readonly size: number;
  readonly sha256: string;
  readonly path: string;
}

/**
 * The upload pipeline (SPEC D12, §12-13). `receive()` streams the multipart
 * body to a temp file, detects the type from the magic bytes (the declared
 * type and the file name are ignored) and stops as soon as the file passes
 * the limit of its type. `prepare()` re-encodes images with sharp, which
 * drops EXIF/GPS, and hashes the bytes that will be stored.
 */
@Injectable()
export class UploadPipeline {
  async receive(req: IncomingMessage): Promise<ReceivedUpload> {
    const declaredLength = Number(req.headers['content-length']);
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MEDIA_MAX_REQUEST_BYTES
    ) {
      throw tooLarge();
    }

    let parser: busboy.Busboy;
    try {
      parser = busboy({
        headers: req.headers,
        // busboy emits `*Limit` when the count reaches the limit, so each is
        // one above what is allowed: reaching it means there is an extra part.
        limits: {
          files: 2,
          fields: 2,
          parts: UPLOAD_MAX_PARTS + 1,
          fieldSize: ALT_MAX_BYTES,
          fileSize: MEDIA_MAX_FILE_BYTES + 1,
        },
        defParamCharset: 'utf8',
      });
    } catch {
      throw new HttpException(
        {
          errorCode: MEDIA_ERROR_CODES.INVALID_UPLOAD,
          message: MEDIA_ERROR_MESSAGES.NOT_MULTIPART,
        },
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }

    const directory = await mkdtemp(join(tmpdir(), UPLOAD_TEMP_PREFIX));
    const dispose = (): Promise<void> =>
      rm(directory, { recursive: true, force: true });

    return new Promise<ReceivedUpload>((resolve, reject) => {
      let settled = false;
      let alt: string | null = null;
      let fileName = FALLBACK_FILE_NAME;
      let spooling: Promise<Spooled> | undefined;

      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        req.unpipe(parser);
        parser.destroy();
        void dispose().finally(() =>
          reject(error instanceof Error ? error : new Error('Upload failed')),
        );
      };

      parser.on('field', (name, value, info) => {
        if (name !== UPLOAD_FIELDS.ALT) {
          fail(invalidUpload(MEDIA_ERROR_MESSAGES.UNEXPECTED_PART));
          return;
        }
        if (info.valueTruncated || Array.from(value).length > ALT_MAX_LENGTH) {
          fail(invalidUpload(MEDIA_ERROR_MESSAGES.ALT_TOO_LONG));
          return;
        }
        const trimmed = value.trim();
        alt = trimmed === '' ? null : trimmed;
      });

      parser.on('file', (name, stream, info) => {
        if (name !== UPLOAD_FIELDS.FILE || spooling !== undefined) {
          stream.resume();
          fail(invalidUpload(MEDIA_ERROR_MESSAGES.UNEXPECTED_PART));
          return;
        }
        fileName = sanitizeFileName(info.filename ?? '');
        spooling = this.spool(stream, directory);
        spooling.catch(fail);
      });

      for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit']) {
        parser.on(event, () =>
          fail(invalidUpload(MEDIA_ERROR_MESSAGES.UNEXPECTED_PART)),
        );
      }
      parser.on('error', fail);
      req.on('error', fail);
      req.on('aborted', () =>
        fail(invalidUpload(MEDIA_ERROR_MESSAGES.NO_FILE)),
      );

      parser.on('close', () => {
        if (settled) return;
        if (spooling === undefined) {
          fail(invalidUpload(MEDIA_ERROR_MESSAGES.NO_FILE));
          return;
        }
        spooling
          .then((spooled) => {
            if (settled) return;
            settled = true;
            resolve({ ...spooled, fileName, alt, dispose });
          })
          .catch(fail);
      });

      req.pipe(parser);
    });
  }

  /**
   * Writes the stream to a temp file under the limit of the detected type.
   * The type is detected from the first bytes, before anything else is kept.
   */
  private async spool(stream: Readable, directory: string): Promise<Spooled> {
    const path = join(directory, 'upload');
    const hash = createHash('sha256');
    const head: Buffer[] = [];
    let headLength = 0;
    let detected: { mimeType: AllowedMime; kind: MediaKind } | undefined;
    let size = 0;
    const fileHandle = await open(path, 'wx');

    const accept = async (): Promise<void> => {
      const sniffed = await fileTypeFromBuffer(Buffer.concat(head));
      const allowed =
        sniffed === undefined ? undefined : allowedMediaTypeOf(sniffed.mime);
      if (sniffed === undefined || allowed === undefined) {
        throw unsupportedType(MEDIA_ERROR_MESSAGES.UNSUPPORTED_TYPE);
      }
      detected = { mimeType: sniffed.mime as AllowedMime, kind: allowed.kind };
    };

    const write = async (chunk: Buffer): Promise<void> => {
      size += chunk.length;
      if (detected !== undefined && size > MEDIA_MAX_BYTES[detected.kind]) {
        throw tooLarge();
      }
      hash.update(chunk);
      await fileHandle.write(chunk);
    };

    try {
      for await (const chunk of stream) {
        const buffer = chunk as Buffer;
        if (detected === undefined) {
          head.push(buffer);
          headLength += buffer.length;
          if (headLength < SNIFF_BYTES) continue;
          await accept();
          for (const part of head) await write(part);
          head.length = 0;
          continue;
        }
        await write(buffer);
      }
      if (detected === undefined) {
        await accept();
        for (const part of head) await write(part);
      }
    } finally {
      await fileHandle.close();
    }
    if (detected === undefined || size === 0) {
      throw unsupportedType(MEDIA_ERROR_MESSAGES.UNSUPPORTED_TYPE);
    }
    return { ...detected, size, sha256: hash.digest('hex'), path };
  }

  async prepare(received: ReceivedUpload): Promise<PreparedUpload> {
    if (received.kind !== 'image') {
      return {
        mimeType: received.mimeType,
        kind: received.kind,
        size: received.size,
        sha256: received.sha256,
        width: null,
        height: null,
        open: () => createReadStream(received.path),
      };
    }
    const bytes = await this.reencode(received);
    const meta = await sharp(bytes).metadata();
    return {
      mimeType: received.mimeType,
      kind: 'image',
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      width: meta.width ?? null,
      height: meta.pageHeight ?? meta.height ?? null,
      open: () => Readable.from([bytes]),
    };
  }

  /**
   * Decodes and re-encodes in the same format. sharp writes no EXIF/XMP/IPTC
   * unless asked to, so GPS and camera data are gone; orientation is applied
   * first (`rotate`) and the ICC profile kept so colours stay right. Bytes
   * that pass the magic-byte check but do not decode are refused.
   */
  private async reencode(received: ReceivedUpload): Promise<Buffer> {
    const encode = imageEncoderOf(received.mimeType);
    if (encode === undefined) {
      throw unsupportedType(MEDIA_ERROR_MESSAGES.UNSUPPORTED_TYPE);
    }
    try {
      const input = await readFile(received.path);
      const image = sharp(input, {
        limitInputPixels: MAX_IMAGE_PIXELS,
        animated: true,
      })
        .rotate()
        .keepIccProfile();
      return await encode(image);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw unsupportedType(MEDIA_ERROR_MESSAGES.UNREADABLE_IMAGE);
    }
  }
}
