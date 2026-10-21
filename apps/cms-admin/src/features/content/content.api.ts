import type { AxiosInstance } from 'axios';

import {
  DOCUMENT_STATUS,
  MASKED_FIELDS_KEY,
} from '../../config/content.constants';
import { API_ENDPOINTS } from '../../config/endpoints';
import type { ContentType } from '../access/access.api';

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

/** Content types and one document's draft (T20, T21). Bearer via the interceptor. */
export function createContentApi(client: AxiosInstance) {
  const { CONTENT_TYPES, DOCUMENTS } = API_ENDPOINTS;
  return {
    getContentType: async (slug: string): Promise<ContentType> => {
      const { data } = await client.get<ContentType>(CONTENT_TYPES.ONE(slug));
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
