import { EN_TEXT } from '@configs/locales/en';
import { createTestServices, renderInApp } from '@test/RenderApp.fixture';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PropertyPanel } from './PropertyPanel';
import type { LocatedError } from './SchemaJson.rules';
import { createNewSchemaTree, findField, schemaTreeReducer } from './SchemaTree.reducer';

const text = EN_TEXT.schemaBuilder.property;
const copy = EN_TEXT.schemaBuilder;

const withFields = [
  ['string', null],
  ['component', null],
  ['boolean', 'f2'],
].reduce(
  (tree, [fieldType, parentId]) =>
    schemaTreeReducer(tree, {
      type: 'addField',
      parentId: parentId as string | null,
      index: 99,
      fieldType: fieldType as never,
    }),
  createNewSchemaTree(),
);

function show(fieldId: string | null, errors: LocatedError[] = []) {
  const onSetKey = vi.fn<Parameters<typeof PropertyPanel>[0]['onSetKey']>();
  const onChangeType = vi.fn<(fieldId: string, fieldType: string) => void>();
  renderInApp(
    createTestServices().services,
    <PropertyPanel
      tree={withFields}
      field={fieldId === null ? null : (findField(withFields.fields, fieldId) ?? null)}
      errors={errors}
      onSetKey={onSetKey}
      onChangeType={onChangeType}
    />,
  );
  return { onSetKey, onChangeType };
}

describe('PropertyPanel', () => {
  it('shows a hint when no field is selected', () => {
    show(null);
    expect(screen.getByText(text.empty)).toBeVisible();
  });

  it('edits the keys of a plain field, with width and no component keys', async () => {
    const { onSetKey } = show('f1');
    expect(screen.queryByLabelText(text.component)).toBeNull();
    await userEvent.type(screen.getByLabelText(text.name), 'x');
    expect(onSetKey).toHaveBeenLastCalledWith('f1', 'name', 'field1x');
    await userEvent.click(screen.getByRole('checkbox', { name: text.required }));
    expect(onSetKey).toHaveBeenLastCalledWith('f1', 'required', true);
    await userEvent.selectOptions(screen.getByLabelText(text.width), 'full');
    expect(onSetKey).toHaveBeenLastCalledWith('f1', 'width', 'full');
    await userEvent.selectOptions(screen.getByLabelText(text.width), text.widthUnset);
    expect(onSetKey).toHaveBeenLastCalledWith('f1', 'width', undefined);
    await userEvent.click(screen.getByRole('checkbox', { name: text.sensitive }));
    expect(onSetKey).toHaveBeenLastCalledWith('f1', 'sensitive', true);
  });

  it('shows component and repeatable, and no width, on a component', async () => {
    const { onSetKey } = show('f2');
    expect(screen.queryByLabelText(text.width)).toBeNull();
    expect(screen.getByLabelText(text.component)).toHaveValue('field2');
    await userEvent.click(screen.getByRole('checkbox', { name: text.repeatable }));
    expect(onSetKey).toHaveBeenLastCalledWith('f2', 'repeatable', true);
  });

  it('refuses a type change that would lose children and says why', async () => {
    const { onChangeType } = show('f2');
    const select = screen.getByLabelText(text.type);
    expect(screen.getByText(text.typeRefusal.holdsFields)).toBeVisible();
    expect(screen.getByRole('option', { name: copy.fieldTypes.string })).toBeDisabled();
    await userEvent.selectOptions(select, copy.fieldTypes.string);
    expect(onChangeType).not.toHaveBeenCalled();
  });

  it('changes the type of a plain field', async () => {
    const { onChangeType } = show('f1');
    await userEvent.selectOptions(screen.getByLabelText(text.type), copy.fieldTypes.integer);
    expect(onChangeType).toHaveBeenCalledWith('f1', 'integer');
  });

  it('shows next to a control the errors that point at its key', () => {
    show('f1', [
      { fieldId: 'f1', key: 'name', message: 'Name is taken' },
      { fieldId: 'f3', key: 'name', message: 'Not mine' },
    ]);
    expect(screen.getByLabelText(text.name)).toHaveAccessibleDescription(
      expect.stringContaining('Name is taken'),
    );
    expect(screen.queryByText('Not mine')).toBeNull();
  });
});
