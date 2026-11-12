import { EN_TEXT } from '@configs/locales/en';
import { createTestServices, renderInApp } from '@test/RenderApp.fixture';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AddFieldMenu, FieldPalette } from './FieldPalette';
import { FIELD_TYPES, type FieldTypeName } from './FieldTypes.registry';

const copy = EN_TEXT.schemaBuilder;

describe('FieldPalette', () => {
  it('lists one item per field type and reports the pick', async () => {
    const onPick = vi.fn<(fieldType: FieldTypeName) => void>();
    renderInApp(createTestServices().services, <FieldPalette canAddComponent onPick={onPick} />);
    expect(screen.getAllByRole('button')).toHaveLength(FIELD_TYPES.length * 2);
    await userEvent.click(screen.getByRole('button', { name: copy.fieldTypes.date }));
    expect(onPick).toHaveBeenCalledWith('date');
  });

  it('gives every item a drag handle named after its type', () => {
    renderInApp(
      createTestServices().services,
      <FieldPalette canAddComponent onPick={vi.fn<(fieldType: FieldTypeName) => void>()} />,
    );
    expect(
      screen.getByRole('button', { name: copy.dnd.paletteHandle(copy.fieldTypes.date) }),
    ).toBeInTheDocument();
  });

  it('leaves Component out where it would be too deep', () => {
    renderInApp(
      createTestServices().services,
      <FieldPalette canAddComponent={false} onPick={vi.fn<(fieldType: FieldTypeName) => void>()} />,
    );
    expect(screen.queryByRole('button', { name: copy.fieldTypes.component })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength((FIELD_TYPES.length - 1) * 2);
  });
});

describe('AddFieldMenu', () => {
  it('opens the palette as a menu and reports the pick', async () => {
    const onPick = vi.fn<(fieldType: FieldTypeName) => void>();
    renderInApp(
      createTestServices().services,
      <AddFieldMenu ownerName="hero" canAddComponent={false} onPick={onPick} />,
    );
    await userEvent.click(screen.getByRole('button', { name: copy.fields.addFieldTo('hero') }));
    expect(screen.getAllByRole('menuitem')).toHaveLength(FIELD_TYPES.length - 1);
    await userEvent.click(screen.getByRole('menuitem', { name: copy.fieldTypes.boolean }));
    expect(onPick).toHaveBeenCalledWith('boolean');
  });
});
