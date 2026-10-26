import {
  CONTENT_ERROR_CODES,
  type CONTENT_STATUSES,
} from './ContentEngine.constants';
import type { ComponentTrees } from './ContentTree.entity';
import type { FieldValues } from './TreeInput.rules';

export class ContentEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentEngineError';
  }
}

export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/** Which root row an operation targets: one draft and one published row per document. */
export interface DocumentRef {
  documentId: string;
  status: ContentStatus;
}

/** A root row with its component tree. `values` and `components` use API names. */
export interface ContentDocument {
  id: number;
  documentId: string;
  version: number;
  publishedAt: Date | null;
  locale: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: number | null;
  updatedBy: number | null;
  values: FieldValues;
  components: ComponentTrees;
}

export class DocumentNotFoundError extends ContentEngineError {
  readonly code = CONTENT_ERROR_CODES.DOCUMENT_NOT_FOUND;

  constructor(
    readonly slug: string,
    readonly ref: DocumentRef,
  ) {
    super(`No ${ref.status} row of ${slug} for document ${ref.documentId}.`);
    this.name = 'DocumentNotFoundError';
  }
}
