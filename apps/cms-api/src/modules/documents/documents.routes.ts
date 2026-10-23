/** SPEC §9 documents (T20 read). `:documentId` is the record's document_id. */
export const DOCUMENTS_ROUTES = {
  ROOT: 'documents',
  BY_SLUG: ':slug',
  BY_ID: ':slug/:documentId',
  PUBLISH: ':slug/:documentId/publish',
  UNPUBLISH: ':slug/:documentId/unpublish',
  PRESENCE: ':slug/:documentId/presence',
  /**
   * SPEC §9 bulk (T34): `BulkController` lives under `documents/:slug/bulk`
   * and is registered before `DocumentsController` (`bulk` is no document id).
   */
  BULK_PREFIX: ':slug/bulk',
  BULK_CREATE: 'create',
  BULK_PUBLISH: 'publish',
  BULK_UNPUBLISH: 'unpublish',
  BULK_DELETE: 'delete',
} as const;
