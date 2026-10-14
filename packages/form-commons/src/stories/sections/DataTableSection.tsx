import { useState } from 'react';
import { EllipsisIcon } from 'lucide-react';

import { DataTable, type SortDir } from '../../components/forms/DataTable';
import { Button } from '../../components/ui/button';
import { POST_COLUMNS, POSTS, sortPosts } from '../posts';
import { Section } from './Section';

/** The row actions trigger, as a placeholder for cms-admin's RowActions menu. */
export const PostActions: React.FC<{ label: string }> = ({ label }) => (
  <Button type="button" variant="ghost" size="icon" aria-label={`Actions for ${label}`}>
    <EllipsisIcon aria-hidden />
  </Button>
);
PostActions.displayName = 'PostActions';

/** A sortable, selectable posts table on local state. */
const PostsDemo: React.FC = () => {
  const [orderBy, setOrderBy] = useState('updatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set(['post-2']));
  return (
    <DataTable
      caption="Blog post entries"
      columns={POST_COLUMNS}
      rows={sortPosts(POSTS, orderBy, sortDir)}
      rowKey={(post) => post.documentId}
      rowLabel={(post) => post.title}
      sort={{
        orderBy,
        sortDir,
        onSortChange: (key, dir) => {
          setOrderBy(key);
          setSortDir(dir);
        },
      }}
      selection={{
        selected,
        onSelectedChange: setSelected,
        allLabel: 'Select all entries on this page',
      }}
      renderActions={(_post, label) => <PostActions label={label} />}
    />
  );
};
PostsDemo.displayName = 'PostsDemo';

/** The tables span the whole section grid. */
const Wide: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">{children}</div>
);
Wide.displayName = 'Wide';

/**
 * The UI kit's DataTable section: content entries with sort, selection and actions, and a plain
 * table without sort or selection. The busy state (60% opacity, below 4.5:1) is left to the
 * Playground's `busy` control, so the axe run here doesn't see it.
 */
export const DataTableSection: React.FC = () => (
  <Section title="DataTable">
    <Wide>
      <PostsDemo />
    </Wide>
    <Wide>
      <DataTable
        caption="Entry overview"
        columns={POST_COLUMNS.filter((column) => column.key !== 'title')}
        rows={POSTS.slice(1, 3)}
        rowKey={(post) => post.documentId}
        rowLabel={(post) => post.title}
      />
    </Wide>
  </Section>
);
DataTableSection.displayName = 'DataTableSection';
