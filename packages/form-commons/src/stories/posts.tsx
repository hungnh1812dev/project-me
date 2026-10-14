import type { DataTableColumn, SortDir } from '../components/forms/DataTable';
import { Badge } from '../components/ui/badge';

/** A content entry, as a collection list shows it. */
export interface Post {
  documentId: string;
  title: string;
  author: string;
  views: number;
  updatedAt: string;
  status: 'draft' | 'modified' | 'published';
}

export const POSTS: readonly Post[] = [
  {
    documentId: 'post-1',
    title: 'Hello world',
    author: 'Jane Doe',
    views: 12345,
    updatedAt: '2026-02-03T10:00:00.000Z',
    status: 'published',
  },
  {
    documentId: 'post-2',
    title: 'Scheduling posts with the new publisher',
    author: 'Sam Lee',
    views: 842,
    updatedAt: '2026-03-14T08:30:00.000Z',
    status: 'modified',
  },
  {
    documentId: 'post-3',
    title: 'Draft: spring roadmap',
    author: 'Jane Doe',
    views: 0,
    updatedAt: '2026-04-01T16:45:00.000Z',
    status: 'draft',
  },
  {
    documentId: 'post-4',
    title: 'Migrating media to the CDN',
    author: 'Alex Kim',
    views: 3021,
    updatedAt: '2026-01-20T12:00:00.000Z',
    status: 'published',
  },
];

const STATUS = {
  draft: { label: 'Draft', variant: 'secondary' },
  modified: { label: 'Modified', variant: 'outline' },
  published: { label: 'Published', variant: 'default' },
} as const;

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' });
const numberFormat = new Intl.NumberFormat('en');

/** Title (a link), Author, Views, Updated and Status, styled as cms-admin's DocumentsTable. */
export const POST_COLUMNS: readonly DataTableColumn<Post>[] = [
  {
    key: 'title',
    header: 'Title',
    sortable: true,
    cell: (post) => (
      <a
        href={`#/posts/${post.documentId}`}
        title={post.title}
        className="text-primary-ink block max-w-64 truncate font-medium underline-offset-4 hover:underline"
      >
        {post.title}
      </a>
    ),
  },
  { key: 'author', header: 'Author', cell: (post) => post.author },
  {
    key: 'views',
    header: 'Views',
    sortable: true,
    cellClassName: 'text-right tabular-nums',
    cell: (post) => numberFormat.format(post.views),
  },
  {
    key: 'updatedAt',
    header: 'Updated',
    sortable: true,
    cellClassName: 'text-muted-foreground tabular-nums',
    cell: (post) => (
      <time dateTime={post.updatedAt} title={post.updatedAt}>
        {dateFormat.format(new Date(post.updatedAt))}
      </time>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    cell: (post) => (
      <Badge variant={STATUS[post.status].variant}>{STATUS[post.status].label}</Badge>
    ),
  },
];

/** `posts` ordered by a column key, as the server would return them. */
export const sortPosts = (posts: readonly Post[], orderBy: string, sortDir: SortDir): Post[] => {
  const key = orderBy as keyof Post;
  const sign = sortDir === 'asc' ? 1 : -1;
  return [...posts].sort((a, b) => (a[key] < b[key] ? -sign : a[key] > b[key] ? sign : 0));
};
