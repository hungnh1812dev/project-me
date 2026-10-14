import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor } from 'storybook/test';

import { DataTable, type SortDir } from '../../components/forms/DataTable';
import { Controlled, useArgsValue } from '../Controlled';
import { POST_COLUMNS, POSTS, sortPosts } from '../posts';
import { DataTableSection, PostActions } from '../sections/DataTableSection';

/** The table state the Playground binds to its `value` arg. */
interface TableState {
  orderBy: string;
  sortDir: SortDir;
  selected: string[];
}

interface PostsTableProps {
  value: TableState;
  onChange: (value: TableState) => void;
  busy?: boolean;
}

/** The posts table, controlled through one `value`: the sort and the selected `documentId`s. */
const PostsTable: React.FC<PostsTableProps> = ({ value, onChange, busy }) => (
  <DataTable
    caption="Blog post entries"
    columns={POST_COLUMNS}
    rows={sortPosts(POSTS, value.orderBy, value.sortDir)}
    rowKey={(post) => post.documentId}
    rowLabel={(post) => post.title}
    sort={{
      orderBy: value.orderBy,
      sortDir: value.sortDir,
      onSortChange: (orderBy, sortDir) => onChange({ ...value, orderBy, sortDir }),
    }}
    selection={{
      selected: new Set(value.selected),
      onSelectedChange: (next) => onChange({ ...value, selected: [...next] }),
      allLabel: 'Select all entries on this page',
    }}
    busy={busy}
    renderActions={(_post, label) => <PostActions label={label} />}
  />
);
PostsTable.displayName = 'PostsTable';

const meta = {
  title: 'Components/DataTable',
  component: PostsTable,
  args: {
    value: { orderBy: 'updatedAt', sortDir: 'desc', selected: [] },
    onChange: fn(),
    busy: false,
  },
  argTypes: {
    value: { control: 'object' },
    busy: { control: 'boolean' },
  },
} satisfies Meta<typeof PostsTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Content entries with sort, selection and actions, and a plain table. */
export const AllStates: Story = {
  parameters: { controls: { disable: true }, actions: { disable: true } },
  render: () => <DataTableSection />,
};

/**
 * The posts table: `value` (sort and selection) and `busy` are Controls, sorting and selecting
 * update the `value` arg, and the "Value:" readout shows it as JSON.
 */
export const Playground: Story = {
  render: function Render({ value, onChange, ...args }) {
    const bind = useArgsValue(value, onChange);
    return <Controlled {...bind}>{(field) => <PostsTable {...args} {...field} />}</Controlled>;
  },
  play: async ({ canvas, userEvent }) => {
    // Sorting only: a checkbox click animates its indicator a frame later, outside `act`, and
    // React logs that as a console error. Selection is covered by e2e/interact.spec.ts.
    await userEvent.click(canvas.getByRole('button', { name: 'Views' }));

    await waitFor(() =>
      expect(canvas.getByRole('status', { name: 'Value' })).toHaveTextContent(
        '{"orderBy":"views","sortDir":"desc","selected":[]}',
      ),
    );
    await expect(canvas.getByRole('columnheader', { name: 'Views' })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  },
};
