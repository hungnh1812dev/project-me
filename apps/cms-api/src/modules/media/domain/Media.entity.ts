import type { PageMeta } from '../../../common/validation/SharedSchemas.rules';

/** A library file row: the fields the API may show, in the storage's own names. */
export interface MediaRecord {
  readonly documentId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly size: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly alt: string | null;
  readonly url: string;
  readonly thumbnailUrl: string | null;
  readonly provider: string;
  readonly isReviewerPreset: boolean;
  readonly createdAt: Date;
}

/** A library file as the API returns it: no storage key, no internal id. */
export interface MediaView {
  readonly id: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly size: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly alt: string | null;
  readonly url: string;
  readonly thumbnailUrl: string | null;
  readonly provider: string;
  readonly isReviewerPreset: boolean;
  readonly createdAt: string;
}

export interface MediaPage<T = MediaRecord> {
  readonly data: readonly T[];
  readonly meta: PageMeta;
}
