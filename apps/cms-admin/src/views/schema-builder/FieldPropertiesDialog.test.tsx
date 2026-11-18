import { EN_TEXT } from '@configs/locales/en';
import { createTestServices, renderInApp } from '@test/RenderApp.fixture';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FieldPropertiesDialog } from './FieldPropertiesDialog';
import type { LocatedError } from './SchemaJson.rules';
import { createNewSchemaTree, findField, schemaTreeReducer } from './SchemaTree.reducer';

const text = EN_TEXT.schemaBuilder.property;
const copy = EN_TEXT.schemaBuilder;

const withFields = [
  ['string', null],
  ['component', null],
  ['boolean', 'f2'],
  ['integer', null],
  ['datetime', null],
  ['enumeration', null],
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

function show(fieldId: string, errors: LocatedError[] = []) {
  const onSetKey = vi.fn<Parameters<typeof FieldPropertiesDialog>[0]['onSetKey']>();
  const onChangeType = vi.fn<(fieldId: string, fieldType: string) => void>();
  const onChangeVariant = vi.fn<(fieldId: string, variant: string) => void>();
  const onClose = vi.fn<() => void>();
  renderInApp(
    createTestServices().services,
    <FieldPropertiesDialog
      tree={withFields}
      field={findField(withFields.fields, fieldId)!}
      errors={errors}
      onSetKey={onSetKey}
      onChangeType={onChangeType}
      onChangeVariant={onChangeVariant}
      onClose={onClose}
      onCloseAutoFocus={(event) => event.preventDefault()}
    />,
  );
  return { onSetKey, onChangeType, onChangeVariant, onClose };
}

describe('FieldPropertiesDialog', () => {
  it('is titled with the field name and closes with Done and Esc', async () => {
    const { onClose } = show('f1');
    expect(screen.getByRole('dialog', { name: 'field1' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: text.done }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
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
    expect(screen.getByRole('option', { name: copy.fieldGroups.textInput })).toBeDisabled();
    await userEvent.selectOptions(select, copy.fieldGroups.textInput);
    expect(onChangeType).not.toHaveBeenCalled();
  });

  it('changes the type of a plain field', async () => {
    const { onChangeType } = show('f3');
    await userEvent.selectOptions(screen.getByLabelText(text.type), copy.fieldTypes.json);
    expect(onChangeType).toHaveBeenCalledWith('f3', 'json');
    expect(screen.queryByLabelText(text.numberType)).toBeNull();
    expect(screen.queryByLabelText(text.dateType)).toBeNull();
    expect(screen.queryByLabelText(text.textType)).toBeNull();
  });

  it('lists a group once in the type select and picks its variant in its own select', async () => {
    const { onChangeVariant } = show('f4');
    expect(screen.getByLabelText(text.type)).toHaveDisplayValue(copy.fieldGroups.number);
    expect(screen.getAllByRole('option', { name: copy.fieldGroups.number })).toHaveLength(1);
    const select = screen.getByLabelText(text.numberType);
    expect(select).toHaveDisplayValue(copy.fieldVariants.integer);
    await userEvent.selectOptions(select, copy.fieldVariants.unsignedInteger);
    expect(onChangeVariant).toHaveBeenCalledWith('f4', 'unsignedInteger');
  });

  it('picks the text type of a text input field', async () => {
    const { onChangeVariant } = show('f1');
    expect(screen.getByLabelText(text.type)).toHaveDisplayValue(copy.fieldGroups.textInput);
    const select = screen.getByLabelText(text.textType);
    expect(select).toHaveDisplayValue(copy.fieldVariants.multiLine);
    await userEvent.selectOptions(select, copy.fieldVariants.singleLine);
    expect(onChangeVariant).toHaveBeenCalledWith('f1', 'singleLine');
  });

  it('picks the date type of a datetime picker field', async () => {
    const { onChangeVariant } = show('f5');
    await userEvent.selectOptions(screen.getByLabelText(text.dateType), copy.fieldVariants.time);
    expect(onChangeVariant).toHaveBeenCalledWith('f5', 'time');
  });

  it('edits the enum options as a new list each time, and shows their errors', async () => {
    const withOptions = schemaTreeReducer(withFields, {
      type: 'setFieldKey',
      fieldId: 'f6',
      key: 'options',
      value: ['a', 'b'],
    });
    const onSetKey = vi.fn<Parameters<typeof FieldPropertiesDialog>[0]['onSetKey']>();
    renderInApp(
      createTestServices().services,
      <FieldPropertiesDialog
        tree={withOptions}
        field={findField(withOptions.fields, 'f6')!}
        errors={[{ fieldId: 'f6', key: 'options', message: 'Options must be unique' }]}
        onSetKey={onSetKey}
        onChangeType={vi.fn<(fieldId: string, fieldType: string) => void>()}
        onChangeVariant={vi.fn<(fieldId: string, variant: string) => void>()}
        onClose={vi.fn<() => void>()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      />,
    );
    expect(screen.getByText('Options must be unique')).toBeVisible();
    await userEvent.type(screen.getByLabelText(text.options.option(1)), 'x');
    expect(onSetKey).toHaveBeenLastCalledWith('f6', 'options', ['ax', 'b']);
    await userEvent.click(screen.getByRole('button', { name: text.options.add }));
    expect(onSetKey).toHaveBeenLastCalledWith('f6', 'options', ['a', 'b', '']);
    await userEvent.click(screen.getByRole('button', { name: text.options.moveDown(1) }));
    expect(onSetKey).toHaveBeenLastCalledWith('f6', 'options', ['b', 'a']);
    await userEvent.click(screen.getByRole('button', { name: text.options.moveUp(2) }));
    expect(onSetKey).toHaveBeenLastCalledWith('f6', 'options', ['b', 'a']);
    expect(screen.getByRole('button', { name: text.options.moveUp(1) })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: text.options.remove(1) }));
    expect(onSetKey).toHaveBeenLastCalledWith('f6', 'options', ['b']);
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

  it('shows an option error at its entry and marks only that entry invalid', () => {
    const withOptions = schemaTreeReducer(withFields, {
      type: 'setFieldKey',
      fieldId: 'f6',
      key: 'options',
      value: ['a', 'a'],
    });
    renderInApp(
      createTestServices().services,
      <FieldPropertiesDialog
        tree={withOptions}
        field={findField(withOptions.fields, 'f6')!}
        errors={[{ fieldId: 'f6', key: 'options', itemIndex: 1, message: 'Duplicate option' }]}
        onSetKey={vi.fn<Parameters<typeof FieldPropertiesDialog>[0]['onSetKey']>()}
        onChangeType={vi.fn<(fieldId: string, fieldType: string) => void>()}
        onChangeVariant={vi.fn<(fieldId: string, variant: string) => void>()}
        onClose={vi.fn<() => void>()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      />,
    );
    expect(screen.getByLabelText(text.options.option(1))).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText(text.options.option(2))).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Duplicate option')).toBeVisible();
  });
});
