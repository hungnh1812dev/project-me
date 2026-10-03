import type {
  ContentType,
  ContentTypeSummary,
  Document,
  FieldDefinition,
  FieldType,
  ListDocumentsResponse,
  ListedDocumentItem,
} from '@/features/content/types';

const STAMP = '2026-01-01T00:00:00.000Z';

/** A `ContentTypeSummary` (C1 item) for a collection type `article`. */
export function makeContentTypeSummary(
  overrides: Partial<ContentTypeSummary> = {},
): ContentTypeSummary {
  return {
    slug: 'article',
    name: 'Article',
    kind: 'collection',
    draftToPublish: true,
    ...overrides,
  };
}

/** A full `ContentType` (C2) for a collection type `article` with title, views and featured fields. */
export function makeContentType(overrides: Partial<ContentType> = {}): ContentType {
  return {
    ...makeContentTypeSummary(),
    documentId: 'ct-article',
    fields: [
      { name: 'title', type: 'text', header: true },
      { name: 'views', type: 'number' },
      { name: 'featured', type: 'boolean' },
      { name: 'body', type: 'richtext' },
    ],
    listFields: ['title', 'updatedAt'],
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  };
}

/**
 * A schema with every field kind: text (one marked `header`), richtext, number, boolean, media,
 * json, a component (with a nested component), a repeatable component (with a nested repeatable),
 * and a field of a type the client doesn't know. Widths cover `50%`, `1/3` and the default.
 */
export function makeFieldSet(): FieldDefinition[] {
  return [
    { name: 'title', type: 'text', header: true, width: '50%' },
    { name: 'slug', type: 'text', width: '50%' },
    { name: 'views', type: 'number', width: '1/3' },
    { name: 'featured', type: 'boolean', width: '1/3' },
    { name: 'body', type: 'richtext' },
    { name: 'coverImage', type: 'media' },
    { name: 'meta', type: 'json' },
    {
      name: 'seo',
      type: 'component',
      component: 'shared.seo',
      fields: [
        { name: 'metaTitle', type: 'text', header: true },
        {
          name: 'social',
          type: 'component',
          component: 'shared.social',
          fields: [{ name: 'handle', type: 'text' }],
        },
      ],
    },
    {
      name: 'gallery',
      type: 'component',
      component: 'media.gallery-item',
      repeatable: true,
      fields: [
        { name: 'caption', type: 'text', header: true },
        { name: 'image', type: 'media' },
        {
          name: 'tags',
          type: 'component',
          component: 'shared.tag',
          repeatable: true,
          fields: [{ name: 'label', type: 'text' }],
        },
      ],
    },
    { name: 'location', type: 'geo' as FieldType },
  ];
}

/** A full `Document` (already unwrapped from `{ data }`). */
export function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    documentId: 'doc-1',
    status: 'draft',
    createdAt: STAMP,
    updatedAt: STAMP,
    updatedBy: { documentId: 'user-1', name: 'Jane Doe' },
    title: 'Hello world',
    ...overrides,
  };
}

/** A D1 list row, with its system columns beside `data`. */
export function makeListedItem(overrides: Partial<ListedDocumentItem> = {}): ListedDocumentItem {
  return {
    id: 1,
    documentId: 'doc-1',
    status: 'draft',
    createdAt: STAMP,
    updatedAt: STAMP,
    updatedBy: { documentId: 'user-1', name: 'Jane Doe' },
    data: { title: 'Hello world' },
    ...overrides,
  };
}

/** A D1 list response. `total` defaults to the number of items. */
export function makeListResponse(
  overrides: Partial<ListDocumentsResponse> = {},
): ListDocumentsResponse {
  const items = overrides.items ?? [makeListedItem()];
  return { items, total: items.length, start: 0, size: 20, ...overrides };
}
