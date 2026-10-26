import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { Injectable } from '@nestjs/common';
import busboy from 'busboy';
import { fileTypeFromBuffer } from 'file-type';

import { DomainError } from '../../../common/errors/Domain.errors';
import { DOMAIN_ERROR_KINDS } from '../../../common/errors/DomainErrorKinds.constants';
import type {
  PreparedUpload,
  ReceivedUpload,
  UploadProcessor,
  UploadStream,
} from '../application/Media.port';
import {
  ALT_MAX_BYTES,
  FALLBACK_FILE_NAME,
  MEDIA_ERROR_CODES,
  MEDIA_ERROR_MESSAGES,
  type MediaKind,
} from '../domain/Media.constants';
import {
  type AllowedMime,
  allowedMediaTypeOf,
  isAltWithinLimit,
  MEDIA_MAX_BYTES,
  MEDIA_MAX_FILE_BYTES,
  MEDIA_MAX_REQUEST_BYTES,
  normalizeAlt,
  sanitizeFileName,
  sha256Hex,
} from '../domain/MediaUpload.rules';
import { reencodeImage } from './SharpImageReencoder.adapter';

/** Bytes read before detecting the type (`file-type` needs at most this many). */
const SNIFF_BYTES = 4_100;

/** Multipart form: one `file` part and an optional `alt` text field. */
const UPLOAD_FIELDS = {
  FILE: 'file',
  ALT: 'alt',
} as const;
const UPLOAD_TEMP_PREFIX = 'abyss-upload-';
/** Parts allowed in the form: the file and the alt field. */
const UPLOAD_MAX_PARTS = 2;

function unsupportedType(message: string): DomainError {
  return new DomainError({
    kind: DOMAIN_ERROR_KINDS.UNSUPPORTED_MEDIA_TYPE,
    errorCode: MEDIA_ERROR_CODES.UNSUPPORTED_TYPE,
    message,
  });
}

function tooLarge(): DomainError {
  return new DomainError({
    kind: DOMAIN_ERROR_KINDS.TOO_LARGE,
    errorCode: MEDIA_ERROR_CODES.FILE_TOO_LARGE,
    message: MEDIA_ERROR_MESSAGES.FILE_TOO_LARGE,
  });
}

function invalidUpload(message: string): DomainError {
  return new DomainError({
    kind: DOMAIN_ERROR_KINDS.INVALID_INPUT,
    errorCode: MEDIA_ERROR_CODES.INVALID_UPLOAD,
    message,
  });
}

interface Spooled {
  readonly mimeType: AllowedMime;
  readonly kind: MediaKind;
  readonly size: number;
  readonly sha256: string;
  readonly path: string;
}

/**
 * The upload pipeline's stream, filesystem and image I/O (SPEC D12, §12-13). `receive()` streams the multipart
 * body to a temp file, detects the type from the magic bytes (the declared
 * type and the file name are ignored) and stops as soon as the file passes
 * the limit of its type. `prepare()` re-encodes images with sharp, which
 * drops EXIF/GPS, and hashes the bytes that will be stored.
 */
@Injectable()
export class UploadProcessingAdapter implements UploadProcessor {
  async receive(upload: UploadStream): Promise<ReceivedUpload> {
    const { body } = upload;
    if (
      upload.declaredLength !== null &&
      upload.declaredLength > MEDIA_MAX_REQUEST_BYTES
    ) {
      throw tooLarge();
    }

    let parser: busboy.Busboy;
    try {
      parser = busboy({
        headers: upload.headers,
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
      throw new DomainError({
        kind: DOMAIN_ERROR_KINDS.UNSUPPORTED_MEDIA_TYPE,
        errorCode: MEDIA_ERROR_CODES.INVALID_UPLOAD,
        message: MEDIA_ERROR_MESSAGES.NOT_MULTIPART,
      });
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
        body.unpipe(parser);
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
        if (info.valueTruncated || !isAltWithinLimit(value)) {
          fail(invalidUpload(MEDIA_ERROR_MESSAGES.ALT_TOO_LONG));
          return;
        }
        alt = normalizeAlt(value);
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
      body.on('error', fail);
      body.on('aborted', () =>
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

      body.pipe(parser);
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
    const image = await reencodeImage(received.path, received.mimeType);
    return {
      mimeType: received.mimeType,
      kind: 'image',
      size: image.bytes.length,
      sha256: sha256Hex(image.bytes),
      width: image.width,
      height: image.height,
      open: () => Readable.from([image.bytes]),
    };
  }
}
