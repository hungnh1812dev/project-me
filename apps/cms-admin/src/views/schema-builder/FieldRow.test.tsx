import { EN_TEXT } from '@configs/locales/en';
import { createTestServices, renderInApp } from '@test/RenderApp.fixture';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FieldRow } from './FieldRow';
import type { ListOwnerId, SchemaField } from './SchemaTree.reducer';

const copy = EN_TEXT.schemaBuilder;
const field: SchemaField = {
  id: 'f1',
  name: 'title',
  type: 'string',
  required: true,
  width: '1/2',
  heldKeys: ['required', 'width'],
  unknownKeys: {},
  fields: [],
};

function show(props: Partial<Parameters<typeof FieldRow>[0]> = {}) {
  const handlers = {
    onSelect: vi.fn<() => void>(),
    onMoveUp: vi.fn<() => void>(),
    onMoveDown: vi.fn<() => void>(),
    onMoveTo: vi.fn<(parentId: ListOwnerId) => void>(),
    onDuplicate: vi.fn<() => void>(),
    onDelete: vi.fn<() => void>(),
  };
  renderInApp(
    createTestServices().services,
    <FieldRow
      field={field}
      isSelected={false}
      hasErrors={false}
      isFirst={false}
      isLast={false}
      moveTargets={[]}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('FieldRow', () => {
  it('shows the name, type and markers', () => {
    show();
    const row = screen.getByRole('button', { name: copy.row.select('title') });
    expect(row).toHaveTextContent('title');
    expect(row).toHaveTextContent(copy.fieldTypes.string);
    expect(row).toHaveTextContent(copy.row.markers.required);
    expect(row).toHaveTextContent(copy.row.markers.width('1/2'));
    expect(row).not.toHaveTextContent(copy.row.markers.sensitive);
  });

  it('marks the selected row and the row with errors', () => {
    show({ isSelected: true, hasErrors: true });
    const row = screen.getByRole('button', { name: copy.row.select('title') });
    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(row).toHaveTextContent(copy.row.hasErrors);
  });

  it('turns the end rows into disabled move buttons', () => {
    show({ isFirst: true, isLast: true });
    expect(screen.getByRole('button', { name: copy.row.moveUp('title') })).toBeDisabled();
    expect(screen.getByRole('button', { name: copy.row.moveDown('title') })).toBeDisabled();
  });

  it('reports every control, Move to with its target list', async () => {
    const handlers = show({ moveTargets: [{ parentId: 'f9', label: 'Inside hero' }] });
    await userEvent.click(screen.getByRole('button', { name: copy.row.select('title') }));
    await userEvent.click(screen.getByRole('button', { name: copy.row.moveUp('title') }));
    await userEvent.click(screen.getByRole('button', { name: copy.row.moveDown('title') }));
    await userEvent.click(screen.getByRole('button', { name: copy.row.duplicate('title') }));
    await userEvent.click(screen.getByRole('button', { name: copy.row.remove('title') }));
    await userEvent.click(screen.getByRole('button', { name: copy.row.moveTo('title') }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Inside hero' }));
    expect(handlers.onSelect).toHaveBeenCalledOnce();
    expect(handlers.onMoveUp).toHaveBeenCalledOnce();
    expect(handlers.onMoveDown).toHaveBeenCalledOnce();
    expect(handlers.onDuplicate).toHaveBeenCalledOnce();
    expect(handlers.onDelete).toHaveBeenCalledOnce();
    expect(handlers.onMoveTo).toHaveBeenCalledWith('f9');
  });

  it('offers no Move to without a target', () => {
    show();
    expect(screen.queryByRole('button', { name: copy.row.moveTo('title') })).toBeNull();
  });
});
