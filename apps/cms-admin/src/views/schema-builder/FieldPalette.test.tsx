import { EN_TEXT } from '@configs/locales/en';
import { createTestServices, renderInApp } from '@test/RenderApp.fixture';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AddFieldMenu, FieldPalette } from './FieldPalette';
import { paletteItems, type FieldTypeName } from './FieldTypes.registry';

const copy = EN_TEXT.schemaBuilder;

describe('FieldPalette', () => {
  it('lists one item per palette entry in order and reports the pick', async () => {
    const onPick = vi.fn<(fieldType: FieldTypeName) => void>();
    renderInApp(createTestServices().services, <FieldPalette canAddComponent onPick={onPick} />);
    expect(screen.getAllByRole('button')).toHaveLength(paletteItems().length * 2);
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      copy.fieldTypes.text,
      copy.fieldTypes.string,
      copy.fieldTypes.richtext,
      copy.fieldGroups.number,
      copy.fieldTypes.boolean,
      copy.fieldGroups.datetimePicker,
      copy.fieldTypes.enumeration,
      copy.fieldTypes.json,
      copy.fieldTypes.media,
      copy.fieldTypes.component,
    ]);
    await userEvent.click(screen.getByRole('button', { name: copy.fieldTypes.boolean }));
    expect(onPick).toHaveBeenCalledWith('boolean');
  });

  it('creates the default type of a group item', async () => {
    const onPick = vi.fn<(fieldType: FieldTypeName) => void>();
    renderInApp(createTestServices().services, <FieldPalette canAddComponent onPick={onPick} />);
    await userEvent.click(screen.getByRole('button', { name: copy.fieldGroups.number }));
    expect(onPick).toHaveBeenLastCalledWith('integer');
    await userEvent.click(screen.getByRole('button', { name: copy.fieldGroups.datetimePicker }));
    expect(onPick).toHaveBeenLastCalledWith('datetime');
  });

  it('gives every item a drag handle named after its type', () => {
    renderInApp(
      createTestServices().services,
      <FieldPalette canAddComponent onPick={vi.fn<(fieldType: FieldTypeName) => void>()} />,
    );
    expect(
      screen.getByRole('button', { name: copy.dnd.paletteHandle(copy.fieldGroups.datetimePicker) }),
    ).toBeInTheDocument();
  });

  it('leaves Component out where it would be too deep', () => {
    renderInApp(
      createTestServices().services,
      <FieldPalette canAddComponent={false} onPick={vi.fn<(fieldType: FieldTypeName) => void>()} />,
    );
    expect(screen.queryByRole('button', { name: copy.fieldTypes.component })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength((paletteItems().length - 1) * 2);
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
    expect(screen.getAllByRole('menuitem')).toHaveLength(paletteItems().length - 1);
    await userEvent.click(screen.getByRole('menuitem', { name: copy.fieldTypes.boolean }));
    expect(onPick).toHaveBeenCalledWith('boolean');
  });

  it('returns focus to the trigger when Escape closes the menu', async () => {
    renderInApp(
      createTestServices().services,
      <AddFieldMenu canAddComponent onPick={vi.fn<(fieldType: FieldTypeName) => void>()} />,
    );
    const trigger = screen.getByRole('button', { name: copy.fields.addField });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('keeps focus the user moved elsewhere while the menu closes', async () => {
    renderInApp(
      createTestServices().services,
      <>
        <AddFieldMenu canAddComponent onPick={vi.fn<(fieldType: FieldTypeName) => void>()} />
        <button type="button">Elsewhere</button>
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: copy.fields.addField }));
    await userEvent.keyboard('{Escape}');
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    elsewhere.focus();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(elsewhere).toHaveFocus();
  });
});
