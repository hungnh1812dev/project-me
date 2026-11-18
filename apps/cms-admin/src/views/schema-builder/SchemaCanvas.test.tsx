import { useReducer } from 'react';
import { EN_TEXT } from '@configs/locales/en';
import { createTestServices, renderInApp } from '@test/RenderApp.fixture';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SchemaCanvas } from './SchemaCanvas';
import type { LocatedError } from './SchemaJson.rules';
import {
  createNewSchemaTree,
  schemaTreeReducer,
  type ListOwnerId,
  type SchemaTreeAction,
} from './SchemaTree.reducer';

const copy = EN_TEXT.schemaBuilder;

/** Adds each field, then names it after its id so names stay unique across levels. */
function build(...steps: [ListOwnerId, string][]) {
  return steps.reduce((tree, [parentId, fieldType]) => {
    const added = schemaTreeReducer(tree, {
      type: 'addField',
      parentId,
      index: 99,
      fieldType: fieldType as never,
    });
    const id = added.lastAddedId as string;
    return schemaTreeReducer(added, { type: 'setFieldKey', fieldId: id, key: 'name', value: id });
  }, createNewSchemaTree());
}

function Harness({
  steps,
  errors = [],
  onSelect,
}: {
  steps: [ListOwnerId, string][];
  errors?: LocatedError[];
  onSelect: (id: string) => void;
}) {
  const [tree, dispatch] = useReducer(schemaTreeReducer, steps, (s) => build(...s));
  const act = (action: SchemaTreeAction) => dispatch(action);
  return (
    <SchemaCanvas
      tree={tree}
      selectedFieldId="f2"
      errors={errors}
      onSelect={onSelect}
      onAdd={(parentId, fieldType) =>
        act({ type: 'addField', parentId, index: Number.POSITIVE_INFINITY, fieldType })
      }
      onMove={(fieldId, parentId, index) => act({ type: 'moveField', fieldId, parentId, index })}
      onDuplicate={(fieldId) => act({ type: 'duplicateField', fieldId })}
      onDelete={(fieldId) => act({ type: 'deleteField', fieldId })}
    />
  );
}

function show(steps: [ListOwnerId, string][], errors: LocatedError[] = []) {
  const onSelect = vi.fn<(id: string) => void>();
  renderInApp(
    createTestServices().services,
    <Harness steps={steps} errors={errors} onSelect={onSelect} />,
  );
  return { onSelect };
}

const names = (list: HTMLElement) =>
  within(list)
    .getAllByRole('button', { name: /^Edit / })
    .map((button) => button.getAttribute('aria-label'));

describe('SchemaCanvas', () => {
  it('shows the empty hint and an Add field menu', () => {
    show([]);
    expect(screen.getByText(copy.fields.empty)).toBeVisible();
    expect(screen.getByRole('button', { name: copy.fields.addField })).toBeVisible();
  });

  it('adds a field at the end of the top level and of a component list', async () => {
    show([[null, 'component']]);
    await userEvent.click(screen.getByRole('button', { name: copy.fields.addFieldTo('f1') }));
    await userEvent.click(await screen.findByRole('menuitem', { name: copy.fieldTypes.string }));
    const inner = screen.getByRole('list', { name: copy.fields.listLabel('f1') });
    expect(names(inner)).toEqual([copy.row.select('field1')]);
  });

  it('moves a field up and down by the controls, keeping focus on it', async () => {
    show([
      [null, 'string'],
      [null, 'boolean'],
    ]);
    const root = screen.getByRole('list', { name: copy.fields.rootListLabel });
    await userEvent.click(screen.getByRole('button', { name: copy.row.moveUp('f2') }));
    expect(names(root)).toEqual([copy.row.select('f2'), copy.row.select('f1')]);
    expect(screen.getByRole('button', { name: copy.row.select('f2') })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: copy.row.moveDown('f2') }));
    expect(names(root)).toEqual([copy.row.select('f1'), copy.row.select('f2')]);
  });

  it('moves a field into a component and back out across levels', async () => {
    show([
      [null, 'string'],
      [null, 'component'],
    ]);
    await userEvent.click(screen.getByRole('button', { name: copy.row.moveTo('f1') }));
    await userEvent.click(
      await screen.findByRole('menuitem', { name: copy.row.moveToComponent('f2') }),
    );
    const inner = screen.getByRole('list', { name: copy.fields.listLabel('f2') });
    expect(names(inner)).toEqual([copy.row.select('f1')]);
    await userEvent.click(screen.getByRole('button', { name: copy.row.moveTo('f1') }));
    await userEvent.click(await screen.findByRole('menuitem', { name: copy.row.moveToRoot }));
    expect(screen.queryByRole('list', { name: copy.fields.listLabel('f2') })).toBeNull();
  });

  it('does not offer Component or Move to past the third level', async () => {
    show([
      [null, 'component'],
      ['f1', 'component'],
      ['f2', 'component'],
      [null, 'string'],
    ]);
    await userEvent.click(screen.getByRole('button', { name: copy.fields.addFieldTo('f1') }));
    expect(await screen.findByRole('menuitem', { name: copy.fieldTypes.component })).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: copy.fields.addFieldTo('f3') }));
    expect(await screen.findByRole('menuitem', { name: copy.fieldTypes.string })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: copy.fieldTypes.component })).toBeNull();
  });

  it('duplicates a field with a free name', async () => {
    show([[null, 'string']]);
    await userEvent.click(screen.getByRole('button', { name: copy.row.duplicate('f1') }));
    const root = screen.getByRole('list', { name: copy.fields.rootListLabel });
    expect(names(root)).toEqual([copy.row.select('f1'), copy.row.select('f1_copy')]);
  });

  it('deletes a plain field at once and asks before deleting a component with fields', async () => {
    show([
      [null, 'string'],
      [null, 'component'],
      ['f2', 'string'],
    ]);
    await userEvent.click(screen.getByRole('button', { name: copy.row.remove('f1') }));
    expect(screen.queryByRole('button', { name: copy.row.select('f1') })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: copy.row.remove('f2') }));
    const dialog = await screen.findByRole('dialog', {
      name: copy.row.deleteDialog.title('f2'),
    });
    expect(dialog).toHaveTextContent(copy.row.deleteDialog.description(1));
    await userEvent.click(
      within(dialog).getByRole('button', { name: copy.row.deleteDialog.cancel }),
    );
    expect(screen.getByRole('button', { name: copy.row.select('f2') })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: copy.row.remove('f2') }));
    await userEvent.click(
      await screen.findByRole('button', { name: copy.row.deleteDialog.confirm('f2') }),
    );
    expect(screen.queryByRole('button', { name: copy.row.select('f2') })).toBeNull();
  });

  it('marks the selected row and the rows that have errors', () => {
    show(
      [
        [null, 'string'],
        [null, 'string'],
      ],
      [{ fieldId: 'f1', key: 'name', message: 'bad' }],
    );
    expect(screen.getByRole('button', { name: copy.row.select('f1') })).toHaveTextContent(
      copy.row.hasErrors,
    );
    expect(screen.getByRole('button', { name: copy.row.select('f2') })).not.toHaveTextContent(
      copy.row.hasErrors,
    );
    expect(screen.getByRole('button', { name: copy.row.select('f2') })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('reports the selected row', async () => {
    const { onSelect } = show([[null, 'string']]);
    await userEvent.click(screen.getByRole('button', { name: copy.row.select('f1') }));
    expect(onSelect).toHaveBeenCalledWith('f1');
  });
});
