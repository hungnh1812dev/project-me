import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { COPY } from '../../config/copy.constants';
import type { ContentTypeField } from '../content-types';
import type { FieldList } from './access.api';
import { FieldPicker } from './FieldPicker';

const copy = COPY.access.fields;
const FIELDS = [{ path: 'title' }] as unknown as ContentTypeField[];

function renderPicker(props: {
  value: FieldList;
  disabled: boolean;
  onChange: (value: FieldList) => void;
}) {
  render(
    <FieldPicker
      legend="Readable fields"
      fields={FIELDS}
      emptyHint="none"
      {...props}
    />,
  );
}

describe('FieldPicker', () => {
  it('emits exactly null for all fields and [] for some fields', async () => {
    const onChange = vi.fn<(value: FieldList) => void>();
    renderPicker({ value: [], disabled: false, onChange });
    await userEvent.click(screen.getByRole('radio', { name: copy.all }));
    expect(onChange).toHaveBeenLastCalledWith(null);

    cleanup();
    onChange.mockClear();
    renderPicker({ value: null, disabled: false, onChange });
    await userEvent.click(screen.getByRole('radio', { name: copy.some }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('ignores clicks on both radios when disabled', async () => {
    const onChange = vi.fn<(value: FieldList) => void>();
    renderPicker({ value: [], disabled: true, onChange });
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toBeDisabled();
      await userEvent.click(radio);
    }
    expect(onChange).not.toHaveBeenCalled();
  });
});
