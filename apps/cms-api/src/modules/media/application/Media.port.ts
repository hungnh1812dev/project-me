import type { IncomingHttpHeaders } from 'node:http';
import type { Readable } from 'node:stream';

import type { MediaKind } from '../domain/Media.constants';
import type { AllowedMime } from '../domain/MediaUpload.rules';

/** DI token of the `UploadProcessor` adapter. */
export const UPLOAD_PROCESSOR = Symbol('UPLOAD_PROCESSOR');

/** The request body as the controller hands it over: no Express request type. */
export interface UploadStream {
  readonly headers: IncomingHttpHeaders;
  /** The `Content-Length` header, `null` when absent or not a number. */
  readonly declaredLength: number | null;
  readonly body: Readable;
}

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

/**
 * The upload steps that do stream, filesystem and native-image I/O (SPEC D12,
 * §12-13). `receive` streams the multipart body to a temp file and detects
 * the type from the magic bytes; `prepare` re-encodes images (dropping EXIF)
 * and hashes the bytes that will be stored. Both throw `DomainError`.
 */
export interface UploadProcessor {
  receive(upload: UploadStream): Promise<ReceivedUpload>;
  prepare(received: ReceivedUpload): Promise<PreparedUpload>;
}
