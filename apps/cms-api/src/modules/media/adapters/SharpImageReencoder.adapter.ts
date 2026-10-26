import { readFile } from 'node:fs/promises';

import sharp from 'sharp';

import { DomainError } from '../../../common/errors/Domain.errors';
import { DOMAIN_ERROR_KINDS } from '../../../common/errors/DomainErrorKinds.constants';
import {
  MEDIA_ERROR_CODES,
  MEDIA_ERROR_MESSAGES,
} from '../domain/Media.constants';
import type { ImageMime } from '../domain/MediaUpload.rules';

/** Decompression-bomb guard for sharp: most input pixels re-encoded. */
const MAX_IMAGE_PIXELS = 50_000_000;
const IMAGE_QUALITY = 90;

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

function unsupportedImage(message: string): DomainError {
  return new DomainError({
    kind: DOMAIN_ERROR_KINDS.UNSUPPORTED_MEDIA_TYPE,
    errorCode: MEDIA_ERROR_CODES.UNSUPPORTED_TYPE,
    message,
  });
}

export interface ReencodedImage {
  readonly bytes: Buffer;
  readonly width: number | null;
  readonly height: number | null;
}

/**
 * Decodes and re-encodes in the same format. sharp writes no EXIF/XMP/IPTC
 * unless asked to, so GPS and camera data are gone; orientation is applied
 * first (`rotate`) and the ICC profile kept so colours stay right. Bytes
 * that pass the magic-byte check but do not decode are refused (415).
 */
export async function reencodeImage(
  path: string,
  mimeType: string,
): Promise<ReencodedImage> {
  const encode = imageEncoderOf(mimeType);
  if (encode === undefined) {
    throw unsupportedImage(MEDIA_ERROR_MESSAGES.UNSUPPORTED_TYPE);
  }
  let bytes: Buffer;
  try {
    const input = await readFile(path);
    const image = sharp(input, {
      limitInputPixels: MAX_IMAGE_PIXELS,
      animated: true,
    })
      .rotate()
      .keepIccProfile();
    bytes = await encode(image);
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw unsupportedImage(MEDIA_ERROR_MESSAGES.UNREADABLE_IMAGE);
  }
  const meta = await sharp(bytes).metadata();
  return {
    bytes,
    width: meta.width ?? null,
    height: meta.pageHeight ?? meta.height ?? null,
  };
}
