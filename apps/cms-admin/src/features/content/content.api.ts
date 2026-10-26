import type { AxiosInstance } from 'axios';

import {
  type BulkAction,
  DOCUMENT_STATUS,
  MASKED_FIELDS_KEY,
} from './content.constants';
import { API_ENDPOINTS } from '../../config/Api.endpoints';
import type { PageMeta } from '../../lib/Api.client';
import { getContentTypes, type ContentType } from '../content-types';

export type FieldValueMap = Record<string, unknown>;

/** One component item as the API returns and accepts it. */
export interface ComponentItem {
  /** Omit for a new item; send the loaded uid back to keep the row. */
  componentUid?: string;
  values?: FieldValueMap;
  components?: Record<string, ComponentItem[]>;
}

/** A document as the caller may see it (masked fields are `"***"` / null). */
export interface DocumentRecord {
  documentId: string;
  version: number;
  values: FieldValueMap;
  components: Record<string, ComponentItem[] | null>;
  /** Paths (no item index) the caller's role cannot read. */
  maskedFields: string[];
}

/** The body of `GET /documents/:slug/:id`. */
type DocumentBody = Omit<DocumentRecord, 'maskedFields'> &
  Record<typeof MASKED_FIELDS_KEY, string[]>;

export interface DocumentTree {
  values?: FieldValueMap;
  components?: Record<string, ComponentItem[]>;
}

/** What POST / PUT answer when the caller cannot read the row back. */
export interface WrittenRef {
  documentId: string;
  version: number;
}

/** One co-editor as `POST .../presence` returns it (the caller is included). */
export interface PresenceEntry {
  accountId: string;
  displayName: string;
  state: 'viewing' | 'editing';
  lastSeenAt: string;
}

/** One row of `GET /documents/:slug` (system fields the caller may not see are absent). */
export interface DocumentListItem {
  documentId: string;
  version: number;
  updatedAt?: string;
  values: FieldValueMap;
}

export interface DocumentList {
  data: DocumentListItem[];
  meta: PageMeta;
}

export interface DocumentListQuery {
  page: number;
  pageSize: number;
  /** `-field` for descending; omitted = the API's default (`-updatedAt`). */
  sort?: string | undefined;
  /** Draft rows for draft-and-publish types. */
  draft: boolean;
}

/** An item of a bulk request: a new tree, or a reference to a document. */
export type BulkItem =
  DocumentTree | { documentId: string; expectedVersion?: number };

export interface BulkItemOk {
  index: number;
  status: 'ok';
  documentId: string;
  version?: number;
}

export interface BulkItemError {
  index: number;
  status: 'error';
  statusCode: number;
  errorCode: string;
  message: string;
}

/** Body of a successful bulk request (also an atomic one). */
export interface BulkResponse {
  atomic: boolean;
  succeeded: number;
  failed: number;
  results: (BulkItemOk | BulkItemError)[];
}

/** Content types and one document's draft. Bearer via the interceptor. */
export function createContentApi(client: AxiosInstance) {
  const { CONTENT_TYPES, DOCUMENTS } = API_ENDPOINTS;
  return {
    listContentTypes: () => getContentTypes(client),

    getContentType: async (slug: string): Promise<ContentType> => {
      const { data } = await client.get<ContentType>(CONTENT_TYPES.ONE(slug));
      return data;
    },

    list: async (
      slug: string,
      { page, pageSize, sort, draft }: DocumentListQuery,
    ): Promise<DocumentList> => {
      const { data } = await client.get<DocumentList>(DOCUMENTS.BY_SLUG(slug), {
        params: {
          page,
          pageSize,
          ...(sort === undefined ? {} : { sort }),
          ...(draft ? { status: DOCUMENT_STATUS.DRAFT } : {}),
        },
      });
      return data;
    },

    bulk: async (
      slug: string,
      action: BulkAction,
      items: readonly BulkItem[],
      atomic: boolean,
    ): Promise<BulkResponse> => {
      const { data } = await client.post<BulkResponse>(
        DOCUMENTS.BULK(slug, action),
        { atomic, items },
      );
      return data;
    },

    getDraft: async (
      slug: string,
      documentId: string,
      draftAndPublish: boolean,
    ): Promise<DocumentRecord> => {
      const { data } = await client.get<DocumentBody>(
        DOCUMENTS.BY_ID(slug, documentId),
        draftAndPublish ? { params: { status: DOCUMENT_STATUS.DRAFT } } : {},
      );
      const { [MASKED_FIELDS_KEY]: maskedFields, ...record } = data;
      return { ...record, maskedFields };
    },

    createDocument: async (
      slug: string,
      tree: DocumentTree,
    ): Promise<WrittenRef> => {
      const { data } = await client.post<WrittenRef>(
        DOCUMENTS.BY_SLUG(slug),
        tree,
      );
      return data;
    },

    updateDocument: async (
      slug: string,
      documentId: string,
      version: number,
      tree: DocumentTree,
    ): Promise<WrittenRef> => {
      const { data } = await client.put<WrittenRef>(
        DOCUMENTS.BY_ID(slug, documentId),
        { ...tree, version },
      );
      return data;
    },

    /** Heartbeat: records the caller and lists everyone active on the draft. */
    sendPresence: async (
      slug: string,
      documentId: string,
    ): Promise<PresenceEntry[]> => {
      const { data } = await client.post<PresenceEntry[]>(
        DOCUMENTS.PRESENCE(slug, documentId),
        {},
      );
      return data;
    },
  };
}

export type ContentApi = ReturnType<typeof createContentApi>;
