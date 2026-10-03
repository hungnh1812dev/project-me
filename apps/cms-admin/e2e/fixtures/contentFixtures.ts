import type { Role } from '../../src/features/auth/types.ts';
import type {
  ContentType,
  Document,
  FieldDefinition,
  FieldType,
} from '../../src/features/content/types.ts';
import { ROLES } from './mockApi.ts';
import type { MockContent } from './mockContent.ts';

// Shared content types and documents for the Phase 5 specs. Seed them with `seedContent`, or add
// single ones through `mockContent.addContentType` / `addDocument` / `setSingle`.

export const STAMP = '2026-01-01T00:00:00.000Z';

const type = (
  overrides: Partial<ContentType> & Pick<ContentType, 'slug' | 'name'>,
): ContentType => ({
  documentId: `ct-${overrides.slug}`,
  kind: 'collection',
  draftToPublish: true,
  fields: [],
  listFields: ['updatedAt'],
  createdAt: STAMP,
  updatedAt: STAMP,
  ...overrides,
});

/** Every field kind: text, richtext, number, boolean, media, json, nested and repeatable components, and an unknown type. */
export const SHOWCASE_FIELDS: FieldDefinition[] = [
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

/** A collection type with every field kind (`showcase`). */
export const FIELD_SHOWCASE: ContentType = type({
  slug: 'showcase',
  name: 'Field showcase',
  fields: SHOWCASE_FIELDS,
  listFields: ['title', 'views', 'featured', 'updatedAt'],
});

/** A collection type for list, filter and action specs (`blog`). */
export const BLOG: ContentType = type({
  slug: 'blog',
  name: 'Blog post',
  fields: [
    { name: 'title', type: 'text', header: true },
    { name: 'excerpt', type: 'text' },
    { name: 'views', type: 'number', width: '50%' },
    { name: 'featured', type: 'boolean', width: '50%' },
    { name: 'body', type: 'richtext' },
    { name: 'cover', type: 'media' },
  ],
  listFields: ['title', 'views', 'featured', 'updatedAt'],
});

/** A single type (`homepage`). */
export const HOMEPAGE: ContentType = type({
  slug: 'homepage',
  name: 'Homepage',
  kind: 'single',
  fields: [
    { name: 'headline', type: 'text', header: true },
    { name: 'intro', type: 'richtext' },
    { name: 'visitors', type: 'number' },
  ],
  listFields: ['headline'],
});

/** A "Mode B" collection type: `draftToPublish` is false, so publish and unpublish answer 400. */
export const CHANGELOG: ContentType = type({
  slug: 'changelog',
  name: 'Changelog',
  draftToPublish: false,
  fields: [
    { name: 'version', type: 'text', header: true },
    { name: 'notes', type: 'richtext' },
  ],
  listFields: ['version', 'createdAt'],
});

/** A blog post. `n` sets its id-like parts and its title; dates move one day per `n`. */
export function blogPost(n: number, overrides: Partial<Document> = {}): Document {
  const day = String(n).padStart(2, '0');
  const stamp = `2026-02-${day}T09:00:00.000Z`;
  return {
    documentId: `blog-${n}`,
    status: 'draft',
    createdAt: stamp,
    updatedAt: stamp,
    updatedBy: { documentId: 'user-1', name: 'Jane Doe' },
    title: `Post ${n}`,
    excerpt: `Excerpt of post ${n}`,
    views: n * 10,
    featured: n % 2 === 0,
    body: `<p>Body of post ${n}</p>`,
    cover: null,
    ...overrides,
  };
}

/** Adds the four types, three blog posts (draft, published, modified) and a never-saved homepage. */
export function seedContent(content: MockContent): void {
  for (const contentType of [FIELD_SHOWCASE, BLOG, HOMEPAGE, CHANGELOG]) {
    content.addContentType(contentType);
  }
  content.addDocument('blog', blogPost(1));
  content.addDocument('blog', blogPost(2, { status: 'published' }));
  content.addDocument('blog', blogPost(3, { status: 'modified' }));
  content.setSingle('homepage', null);
}

/** Super admin plus `content_type:manager`, which the seeded super_admin has (C3). */
export const CONTENT_MANAGER: Role = {
  ...ROLES.superAdmin,
  documentId: 'role-content-manager',
  slug: 'content_manager',
  name: 'Content Manager',
  permissions: [...ROLES.superAdmin.permissions, 'content_type:manager'],
};
