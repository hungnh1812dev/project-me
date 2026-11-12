import { useReducer, useState } from 'react';
import { EN_TEXT } from '@configs/locales/en';
import { createTestServices, renderInApp } from '@test/RenderApp.fixture';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FieldPalette } from './FieldPalette';
import type { FieldTypeName } from './FieldTypes.registry';
import { SchemaCanvas } from './SchemaCanvas';
import { allowedOwnersOf, placeOf, SchemaDragContext } from './SchemaDragContext';
import {
  canPlaceComponentIn,
  createNewSchemaTree,
  schemaTreeReducer,
  type ListOwnerId,
} from './SchemaTree.reducer';

const copy = EN_TEXT.schemaBuilder;

/** Adds each field, then names it after its id so names stay unique across levels. */
function build(...steps: [ListOwnerId, string][]) {
  return steps.reduce((tree, [parentId, fieldType]) => {
    const added = schemaTreeReducer(tree, {
      type: 'addField',
      parentId,
      index: 99,
      fieldType: fieldType as FieldTypeName,
    });
    const id = added.lastAddedId as string;
    return schemaTreeReducer(added, { type: 'setFieldKey', fieldId: id, key: 'name', value: id });
  }, createNewSchemaTree());
}

function Harness({ steps }: { steps: [ListOwnerId, string][] }) {
  const [tree, dispatch] = useReducer(schemaTreeReducer, steps, (s) => build(...s));
  const [selected, setSelected] = useState<string | null>(null);
  const addToList = (
    parentId: ListOwnerId,
    fieldType: FieldTypeName,
    index = Number.POSITIVE_INFINITY,
  ) => dispatch({ type: 'addField', parentId, index, fieldType });
  return (
    <SchemaDragContext
      tree={tree}
      onAdd={addToList}
      onMove={(fieldId, parentId, index) =>
        dispatch({ type: 'moveField', fieldId, parentId, index })
      }
      onSelect={setSelected}
    >
      <p data-testid="selected">{selected ?? 'none'}</p>
      <SchemaCanvas
        tree={tree}
        selectedFieldId={selected}
        errors={[]}
        onSelect={setSelected}
        onAdd={addToList}
        onMove={(fieldId, parentId, index) =>
          dispatch({ type: 'moveField', fieldId, parentId, index })
        }
        onDuplicate={(fieldId) => dispatch({ type: 'duplicateField', fieldId })}
        onDelete={(fieldId) => dispatch({ type: 'deleteField', fieldId })}
      />
      <FieldPalette
        canAddComponent={canPlaceComponentIn(tree, null)}
        onPick={(fieldType) => addToList(null, fieldType)}
      />
    </SchemaDragContext>
  );
}

/** jsdom has no layout: give every element a box that follows document order, so the keyboard sensor can step through the zones. */
function stubLayoutByDocumentOrder() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const index = Array.from(document.body.querySelectorAll('*')).indexOf(this);
    const top = index * 10;
    return {
      x: 0,
      y: top,
      top,
      bottom: top + 8,
      left: 0,
      right: 200,
      width: 200,
      height: 8,
      toJSON: () => ({}),
    };
  });
}

const names = (list: HTMLElement) =>
  within(list)
    .getAllByRole('button', { name: /^Edit / })
    .map((button) => button.getAttribute('aria-label'));

const announcement = () => screen.getByRole('status').textContent;

describe('SchemaDragContext by keyboard', () => {
  beforeEach(stubLayoutByDocumentOrder);
  afterEach(() => vi.restoreAllMocks());

  it('reorders a field within its list and announces each step', async () => {
    renderInApp(
      createTestServices().services,
      <Harness
        steps={[
          [null, 'string'],
          [null, 'boolean'],
        ]}
      />,
    );
    const handle = screen.getByRole('button', { name: copy.dnd.fieldHandle('f1') });
    handle.focus();
    await userEvent.keyboard(' ');
    await userEvent.keyboard('{ArrowDown}');
    expect(announcement()).toContain('f1 is over position 2 of 2 in Fields');
    await userEvent.keyboard(' ');
    expect(announcement()).toBe(
      copy.dnd.dropped('f1', copy.dnd.place(2, 2, copy.fields.rootListLabel)),
    );
    const root = screen.getByRole('list', { name: copy.fields.rootListLabel });
    expect(names(root)).toEqual([copy.row.select('f2'), copy.row.select('f1')]);
    expect(screen.getByTestId('selected')).toHaveTextContent('f1');
  });

  it('cancels with Escape and leaves the order unchanged', async () => {
    renderInApp(
      createTestServices().services,
      <Harness
        steps={[
          [null, 'string'],
          [null, 'boolean'],
        ]}
      />,
    );
    screen.getByRole('button', { name: copy.dnd.fieldHandle('f1') }).focus();
    await userEvent.keyboard(' ');
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{Escape}');
    expect(announcement()).toBe(copy.dnd.cancelled('f1'));
    const root = screen.getByRole('list', { name: copy.fields.rootListLabel });
    expect(names(root)).toEqual([copy.row.select('f1'), copy.row.select('f2')]);
  });

  it('moves a field into a component', async () => {
    renderInApp(
      createTestServices().services,
      <Harness
        steps={[
          [null, 'component'],
          [null, 'string'],
        ]}
      />,
    );
    screen.getByRole('button', { name: copy.dnd.fieldHandle('f2') }).focus();
    await userEvent.keyboard(' ');
    await userEvent.keyboard('{ArrowUp}');
    await userEvent.keyboard(' ');
    expect(announcement()).toContain('dropped at');
    expect(screen.getByRole('list', { name: copy.fields.listLabel('f1') })).toBeInTheDocument();
  });

  it('drops a palette item into the fields', async () => {
    renderInApp(createTestServices().services, <Harness steps={[[null, 'string']]} />);
    screen.getByRole('button', { name: copy.dnd.paletteHandle(copy.fieldTypes.boolean) }).focus();
    await userEvent.keyboard(' ');
    expect(announcement()).toContain(copy.fieldTypes.boolean);
    await userEvent.keyboard('{ArrowUp}');
    await userEvent.keyboard(' ');
    const root = screen.getByRole('list', { name: copy.fields.rootListLabel });
    expect(names(root)).toHaveLength(2);
  });
});

describe('palette drag by keyboard into an empty component box', () => {
  beforeEach(stubLayoutByDocumentOrder);
  afterEach(() => vi.restoreAllMocks());

  it('reaches the box even when a top-level field follows it', async () => {
    renderInApp(
      createTestServices().services,
      <Harness
        steps={[
          [null, 'component'],
          [null, 'string'],
        ]}
      />,
    );
    screen.getByRole('button', { name: copy.dnd.paletteHandle(copy.fieldTypes.boolean) }).focus();
    await userEvent.keyboard(' ');
    const listLabel = copy.fields.listLabel('f1');
    for (let step = 0; step < 12 && !announcement()?.includes(listLabel); step += 1) {
      await userEvent.keyboard('{ArrowUp}');
    }
    expect(announcement()).toContain(listLabel);
    await userEvent.keyboard(' ');
    expect(screen.getByRole('list', { name: listLabel })).toBeInTheDocument();
  });
});

describe('field drag by keyboard into an empty component box', () => {
  beforeEach(stubLayoutByDocumentOrder);
  afterEach(() => vi.restoreAllMocks());

  it('reaches the box of a component above it', async () => {
    renderInApp(
      createTestServices().services,
      <Harness
        steps={[
          [null, 'component'],
          [null, 'string'],
        ]}
      />,
    );
    screen.getByRole('button', { name: copy.dnd.fieldHandle('f2') }).focus();
    await userEvent.keyboard(' ');
    const listLabel = copy.fields.listLabel('f1');
    for (let step = 0; step < 6 && !announcement()?.includes(listLabel); step += 1) {
      await userEvent.keyboard('{ArrowUp}');
    }
    expect(announcement()).toContain(listLabel);
  });
});

describe('drop places', () => {
  const threeLevels = build(
    [null, 'component'],
    ['f1', 'component'],
    ['f2', 'component'],
    [null, 'string'],
  );

  it('offers a palette component only to lists that stay within level 3', () => {
    expect(allowedOwnersOf(threeLevels, 'palette:component')).toEqual(new Set([null, 'f1', 'f2']));
    expect(allowedOwnersOf(threeLevels, 'palette:string')).toEqual(
      new Set([null, 'f1', 'f2', 'f3']),
    );
  });

  it('offers a moved subtree only to lists that keep its depth within level 3', () => {
    // f1 holds f2 which holds f3: three levels of its own, so it may only stay at the top
    expect(allowedOwnersOf(threeLevels, 'f1')).toEqual(new Set([null]));
    expect(allowedOwnersOf(threeLevels, 'f4')).toEqual(new Set([null, 'f1', 'f2', 'f3']));
  });

  it('resolves a row to its index in its list and a list zone to its end', () => {
    expect(placeOf(threeLevels, 'palette:string', 'f4', false)).toEqual({
      parentId: null,
      index: 1,
    });
    expect(placeOf(threeLevels, 'palette:string', 'f4', true)).toEqual({
      parentId: null,
      index: 2,
    });
    expect(placeOf(threeLevels, 'f4', 'f1', true)).toEqual({ parentId: null, index: 0 });
    expect(placeOf(threeLevels, 'f4', 'list:f2', false)).toEqual({ parentId: 'f2', index: 1 });
    expect(placeOf(threeLevels, 'f4', 'list:root', false)).toEqual({ parentId: null, index: 2 });
  });
});
