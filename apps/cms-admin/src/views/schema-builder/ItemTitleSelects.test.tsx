import { EN_TEXT } from '@configs/locales/en';
import { createTestServices, renderInApp } from '@test/RenderApp.fixture';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ItemTitleSelects, type ItemTitleSelectsProps } from './ItemTitleSelects';
import {
  createNewSchemaTree,
  findField,
  schemaTreeReducer,
  type SchemaField,
} from './SchemaTree.reducer';

const text = EN_TEXT.schemaBuilder.property;

// f1 component; children f2 text, f3 richtext, f4 integer, f5 boolean.
const tree = ['component', 'string', 'richtext', 'integer', 'boolean'].reduce(
  (current, fieldType, index) =>
    schemaTreeReducer(current, {
      type: 'addField',
      parentId: index === 0 ? null : 'f1',
      index: 99,
      fieldType: fieldType as never,
    }),
  createNewSchemaTree(),
);
const component = findField(tree.fields, 'f1')!;
const nameOf = (id: string) => findField(tree.fields, id)!.name;

function show(overrides: Partial<SchemaField> = {}, errors: Record<string, string> = {}) {
  const onSetKey = vi.fn<ItemTitleSelectsProps['onSetKey']>();
  renderInApp(
    createTestServices().services,
    <ItemTitleSelects
      field={{ ...component, ...overrides }}
      errorsOf={(key) => errors[key]}
      onSetKey={onSetKey}
    />,
  );
  return { onSetKey };
}

const optionValues = (label: string) =>
  within(screen.getByLabelText(label))
    .getAllByRole('option')
    .map((option) => (option as HTMLOptionElement).value);

describe('ItemTitleSelects', () => {
  it('lists None and only the text-like children', () => {
    show();
    expect(optionValues(text.itemTitleField)).toEqual(['', nameOf('f2'), nameOf('f4')]);
  });

  it('disables the subtitle until a title is set, and leaves the title child out of it', () => {
    show();
    expect(screen.getByLabelText(text.itemSubtitleField)).toBeDisabled();
  });

  it('offers the other children as subtitle once the title is set', () => {
    show({ titleField: nameOf('f2') });
    expect(screen.getByLabelText(text.itemSubtitleField)).toBeEnabled();
    expect(optionValues(text.itemSubtitleField)).toEqual(['', nameOf('f4')]);
  });

  it('sets a key on change and removes it with None', async () => {
    const { onSetKey } = show({ titleField: nameOf('f2') });
    await userEvent.selectOptions(screen.getByLabelText(text.itemSubtitleField), nameOf('f4'));
    expect(onSetKey).toHaveBeenLastCalledWith('f1', 'subtitleField', nameOf('f4'));
    await userEvent.selectOptions(screen.getByLabelText(text.itemTitleField), text.noItemTitle);
    expect(onSetKey).toHaveBeenLastCalledWith('f1', 'titleField', undefined);
  });

  it('keeps a stale reference as the current value and shows its error at the select', () => {
    show({ titleField: 'gone' }, { titleField: 'No such field.' });
    expect(screen.getByLabelText(text.itemTitleField)).toHaveValue('gone');
    expect(screen.getByText('No such field.')).toBeVisible();
  });
});
