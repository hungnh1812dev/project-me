import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';

import { ComponentList } from './ComponentList';
import { MAX_COMPONENT_DEPTH } from './Content.constants';
import type { FieldNode } from './FieldTree.rules';

const leaf = { children: [] } as unknown as Partial<FieldNode>;

const makeNode = (overrides: Partial<FieldNode> = {}): FieldNode =>
  ({
    uid: 'experience',
    name: 'experience',
    label: 'Experience',
    type: 'component',
    repeatable: true,
    children: [],
    ...leaf,
    ...overrides,
  }) as unknown as FieldNode;

function Harness({
  node,
  items = [],
  depth = 1,
}: {
  node: FieldNode;
  items?: unknown[];
  depth?: number;
}) {
  const form = useForm({ defaultValues: { experience: items } });
  return (
    <FormProvider {...form}>
      <ComponentList node={node} name="experience" masked={new Set()} depth={depth} />
    </FormProvider>
  );
}

const two = [{ componentUid: 'a' }, { componentUid: 'b' }];

describe('ComponentList', () => {
  it('shows one dashed add box when empty and appends an item on click', async () => {
    render(<Harness node={makeNode()} />);
    expect(screen.queryByRole('button', { name: /^add experience$/i })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Click to add experience' }));
    expect(screen.getByRole('button', { name: 'Remove experience 1' })).toBeInTheDocument();
  });

  it('adds by keyboard (Enter and Space)', async () => {
    render(<Harness node={makeNode()} />);
    const slot = screen.getByRole('button', { name: 'Click to add experience' });
    slot.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Remove experience 1' })).toBeInTheDocument();
    await userEvent.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Remove experience 2' })).toBeInTheDocument();
  });

  it('removes an item', async () => {
    render(<Harness node={makeNode()} items={two} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove experience 1' }));
    expect(screen.queryByRole('button', { name: 'Remove experience 2' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove experience 1' })).toBeInTheDocument();
  });

  it('moves items with up and down and disables them at the ends', async () => {
    render(<Harness node={makeNode()} items={two} />);
    expect(screen.getByRole('button', { name: 'Move experience 1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move experience 2 down' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Move experience 1 down' }));
    const items = screen.getAllByRole('listitem');
    expect(
      within(items[1]!).getByRole('button', { name: 'Move experience 2 down' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move experience 2 up' })).toHaveFocus();
  });

  it('shows no move buttons for a single item', () => {
    render(<Harness node={makeNode()} items={[{ componentUid: 'a' }]} />);
    expect(screen.queryByRole('button', { name: /Move experience/ })).toBeNull();
  });

  it('keeps the add slot below the items of a repeatable component', () => {
    render(<Harness node={makeNode()} items={two} />);
    const slot = screen.getByRole('button', { name: 'Click to add experience' });
    const list = screen.getByRole('list');
    expect(list.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('hides the add slot once a single component is filled', () => {
    render(<Harness node={makeNode({ repeatable: false })} items={[{ componentUid: 'a' }]} />);
    expect(screen.queryByRole('button', { name: /Click to add/ })).toBeNull();
  });

  it.each([2, MAX_COMPONENT_DEPTH])('renders the same controls at depth %i', (depth) => {
    render(<Harness node={makeNode()} items={two} depth={depth} />);
    expect(screen.getByRole('button', { name: 'Remove experience 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move experience 1 down' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Click to add experience' })).toBeInTheDocument();
  });

  it('hides the add slot beyond the maximum depth', () => {
    render(<Harness node={makeNode()} depth={MAX_COMPONENT_DEPTH + 1} />);
    expect(screen.queryByRole('button', { name: /Click to add/ })).toBeNull();
  });
});
