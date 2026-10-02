/** Whether a content type holds one document (`single`) or many (`collection`). */
export type ContentKind = 'single' | 'collection';

/** An item of `GET /content-types` (C1). */
export interface ContentTypeSummary {
  slug: string;
  name: string;
  kind: ContentKind;
  /** When false ("Mode B"), the publish and unpublish routes reject with 400. */
  draftToPublish: boolean;
}

/** The schema field kinds a content type can declare. */
export type FieldType = 'text' | 'richtext' | 'number' | 'boolean' | 'media' | 'json' | 'component';

/** `FieldDefinitionResponseDto`. `component`, `repeatable` and `fields` appear only on component fields. */
export interface FieldDefinition {
  name: string;
  type: FieldType;
  /** Form layout hint: `"100%"`, `"50%"` or `"1/3"`. */
  width?: string;
  /** Marks the field as a default list-table column. */
  header?: boolean;
  component?: string;
  repeatable?: boolean;
  /** Nested component fields, using the same shape. */
  fields?: FieldDefinition[];
}

/** `GET /content-types/:slug` (C2) and the C3 response: the summary plus the schema. */
export interface ContentType extends ContentTypeSummary {
  documentId: string;
  fields: FieldDefinition[];
  /** The configured list-view projection (system columns or text/number/boolean fields). */
  listFields: string[];
  createdAt: string;
  updatedAt: string;
}

/** A document's publication state. */
export type DocumentStatus = 'draft' | 'modified' | 'published';

/** The last editor of a document, or null when unknown. Never a missing key. */
export type UpdatedBy = { documentId: string; name: string } | null;

/** The dynamic, schema-defined fields of a document. Read their shape from `ContentType.fields`. */
export type DocumentData = Record<string, unknown>;

/** The system fields every document carries beside its dynamic fields. */
export interface DocumentSystemFields {
  documentId: string;
  status: DocumentStatus;
  createdAt: string;
  updatedAt: string;
  updatedBy: UpdatedBy;
}

/** A full document (unwrapped from `{ data }`): system fields plus the dynamic fields, spread together. */
export type Document = DocumentSystemFields & DocumentData;

/** The `{ data }` envelope single-document routes respond with. */
export interface DocumentEnvelope {
  data: Document;
}

/** One row of `GET /documents/collection-type/:slug` (D1). System columns sit beside `data`. */
export interface ListedDocumentItem {
  /** Internal autoincrement key, for ordering only. `documentId` is the stable identifier. */
  id: number;
  documentId: string;
  status: DocumentStatus;
  createdAt: string;
  updatedAt: string;
  updatedBy: UpdatedBy;
  /** Projected down to the content type's `listFields`. */
  data: DocumentData;
}

/** `ListDocumentsResponseDto` (D1). */
export interface ListDocumentsResponse {
  items: ListedDocumentItem[];
  total: number;
  start: number;
  size: number;
}

/** `POST /documents/collection-type/:slug/bulk` (D9) response. */
export interface BulkCreateResponse {
  items: DocumentEnvelope[];
}

/** `DELETE /documents/collection-type/:slug/bulk` (D10) response: partial success, no rollback. */
export interface BulkDeleteResult {
  deleted: string[];
  failed: { documentId: string; error?: string }[];
}

/** The publish (S3, D6) and unpublish (S4, D7) response. */
export interface PublishResult {
  status: Extract<DocumentStatus, 'published' | 'draft'>;
}

/** What a hook needs to know about a content type: its slug and whether publishing is allowed. */
export type ContentTypeRef = Pick<ContentTypeSummary, 'slug' | 'draftToPublish'>;

/** The list filter operators the backend accepts. Which apply depends on the field kind. */
export type FilterOperator = '$eq' | '$ne' | '$contains' | '$gt' | '$gte' | '$lt' | '$lte';

/** A filter value. Booleans, numbers and Dates are serialized to strings on the wire. */
export type FilterValue = string | number | boolean | Date;

/** Per-field filters, `{ field: { $op: value } }`. One operator per field. */
export type ListFilters = Record<string, Partial<Record<FilterOperator, FilterValue | undefined>>>;

/** The list sort direction. */
export type SortDir = 'asc' | 'desc';

/** The D1 list query. Field names may use camelCase system columns; they are mapped on the wire. */
export interface ListParams {
  start?: number;
  size?: number;
  orderBy?: string;
  sortDir?: SortDir;
  search?: string;
  filters?: ListFilters;
}
