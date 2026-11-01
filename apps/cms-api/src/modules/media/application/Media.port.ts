import type { IncomingHttpHeaders } from 'node:http';
import type { Readable } from 'node:stream';

import type { UnitOfWork } from '../../../infrastructure/database/TransactionRunner.port';
import type { RowCondition } from '../../access';
import type { MediaKind } from '../domain/Media.constants';
import type { EmbeddedMedia, MediaPage, MediaRecord } from '../domain/Media.entity';
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
  /** `acceptsAlt: false` (a replacement) makes an `alt` field an unexpected part. */
  receive(upload: UploadStream, options?: { acceptsAlt: boolean }): Promise<ReceivedUpload>;
  prepare(received: ReceivedUpload): Promise<PreparedUpload>;
}

/** Providers a storage can report: the values `media_provider` accepts for new files (`preset` is only set by the reviewer seed). */
export type StoredMediaProvider = 'cloudinary' | 'local';

/** DI token of the configured `MediaStorage` (MEDIA_PROVIDER). */
export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');

export interface PutObjectInput {
  /** UUIDv7 storage key (D12); the provider must store the object under it. */
  readonly key: string;
  readonly kind: MediaKind;
  /** Detected from the magic bytes, never the client-declared type. */
  readonly mimeType: string;
  readonly body: Readable;
}

export interface StoredObject {
  /** Public delivery URL. */
  readonly url: string;
  /** Present for images only. */
  readonly thumbnailUrl: string | null;
}

/** A stored file the public file route streams back. */
export interface PublicMediaFile {
  readonly stream: Readable;
  readonly mimeType: string;
  readonly size: number;
}

/**
 * Where media bytes live (SPEC D12). The upload pipeline has already
 * validated and re-encoded the bytes; the adapter only stores them.
 */
export interface MediaStorage {
  /** Written to every file this storage stores; never taken from a request. */
  readonly provider: StoredMediaProvider;
  put(input: PutObjectInput): Promise<StoredObject>;
  /** Removes the object; deleting a missing object is not an error. */
  delete(key: string, kind: MediaKind): Promise<void>;
  /**
   * Only for storages whose bytes this API serves (`GET /media-files/:fileName`).
   * `null` for a name it does not own, never a throw.
   */
  openPublicFile?(fileName: string): Promise<PublicMediaFile | null>;
}

/** DI token of the `MediaRepository` adapter. */
export const MEDIA_REPOSITORY = Symbol('MEDIA_REPOSITORY');

/** A row to insert; the server-made values (key, hash, urls) are already set. */
export interface NewMediaFile {
  readonly fileName: string;
  readonly mimeType: string;
  readonly size: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly alt: string | null;
  readonly storageKey: string;
  readonly sha256: string;
  readonly url: string;
  readonly thumbnailUrl: string | null;
  readonly provider: StoredMediaProvider;
  readonly createdById: number;
}

/** The stored bytes and their derived values, as they replace a file's current ones. */
export interface ReplacementFile {
  readonly fileName: string;
  readonly mimeType: string;
  readonly size: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly storageKey: string;
  readonly sha256: string;
  readonly url: string;
  readonly thumbnailUrl: string | null;
  readonly provider: StoredMediaProvider;
}

/** A soft-deleted row old enough to purge. */
export interface PurgeCandidate {
  readonly id: number;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly provider: string;
}

/** A live file found for an embed, with the internal id the document stored. */
export interface EmbeddableFile {
  readonly internalId: number;
  readonly file: EmbeddedMedia;
}

/**
 * Persistence of library files. A `rowCondition` is the actor's row filter
 * for the action (`null` = every row); soft-deleted rows are never reached
 * except by `findPurgeBatch`. Methods with a `unit` run in the caller's
 * transaction.
 */
export interface MediaRepository {
  create(file: NewMediaFile): Promise<MediaRecord>;
  /** Newest first. */
  list(selection: {
    rowCondition: RowCondition | null;
    page: number;
    pageSize: number;
    /** Case-insensitive substring of the file name, already escaped for `ilike`. */
    escapedSearch?: string | undefined;
    /** Exact MIME types to keep (`undefined` = any). */
    mimeTypes?: readonly string[] | undefined;
  }): Promise<MediaPage>;
  /** Internal id of a live file the condition reaches. */
  findLiveId(documentId: string, rowCondition: RowCondition | null): Promise<number | undefined>;
  /** Internal id and MIME type of a live file the condition reaches. */
  findLiveTarget(
    documentId: string,
    rowCondition: RowCondition | null,
  ): Promise<{ id: number; mimeType: string } | undefined>;
  /**
   * Swaps the file's bytes in the caller's transaction (the row must be
   * locked) and inserts a soft-deleted row that takes the old storage key,
   * so the purge job removes the old object later.
   */
  replaceFile(
    unit: UnitOfWork,
    change: { mediaId: number; file: ReplacementFile; replacedAt: Date; updatedById: number },
  ): Promise<{ record: MediaRecord; previousSha256: string }>;
  /** Sets the alt text in one statement that also applies the condition. */
  updateAlt(change: {
    documentId: string;
    alt: string | null;
    updatedById: number;
    rowCondition: RowCondition | null;
  }): Promise<MediaRecord | undefined>;
  /** Locks a live row (`FOR UPDATE`); false when it is gone or deleted. */
  lockLive(unit: UnitOfWork, mediaId: number): Promise<boolean>;
  softDelete(
    unit: UnitOfWork,
    change: { mediaId: number; deletedAt: Date; updatedById: number },
  ): Promise<{ documentId: string; mimeType: string }>;
  /** Internal ids by public id, for the files the condition reaches. */
  findReadableIds(
    documentIds: readonly string[],
    rowCondition: RowCondition | null,
  ): Promise<ReadonlyMap<string, number>>;
  findEmbeddable(ids: {
    internalIds: readonly number[];
    documentIds: readonly string[];
  }): Promise<EmbeddableFile[]>;
  /** Soft-deleted rows older than `cutoff` with an id above `afterId`, in id order. */
  findPurgeBatch(cutoff: Date, afterId: number, limit: number): Promise<PurgeCandidate[]>;
  deleteRow(mediaId: number): Promise<void>;
}

/** DI token of the `MediaReferenceChecker` adapter. */
export const MEDIA_REFERENCE_CHECKER = Symbol('MEDIA_REFERENCE_CHECKER');

export interface MediaReferenceChecker {
  /**
   * True when any draft or published document points at the file. With a
   * `unit` it reads inside that transaction.
   */
  isReferenced(mediaId: number, unit?: UnitOfWork): Promise<boolean>;
}
