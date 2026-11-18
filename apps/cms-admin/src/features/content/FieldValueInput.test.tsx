import { useState } from 'react';
import { EN_TEXT } from '@configs/locales/en';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FieldValueInput } from './FieldValueInput';

const copy = EN_TEXT.content;

function Harness({
  type,
  initial,
  options,
  onValue,
}: {
  type: string;
  initial?: unknown;
  options?: string[];
  onValue: (value: unknown) => void;
}) {
  const [value, setValue] = useState<unknown>(initial);
  return (
    <FieldValueInput
      node={{ type, label: 'Value', ...(options ? { options } : {}) }}
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue(next);
      }}
    />
  );
}

describe('FieldValueInput', () => {
  it('shows and edits text in API form, empty gives undefined', async () => {
    const onValue = vi.fn<(value: unknown) => void>();
    render(<Harness type="text" initial="Hi" onValue={onValue} />);
    const input = screen.getByLabelText('Value');
    expect(input).toHaveValue('Hi');
    await userEvent.type(input, '!');
    expect(onValue).toHaveBeenLastCalledWith('Hi!');
    await userEvent.clear(input);
    expect(onValue).toHaveBeenLastCalledWith(undefined);
  });

  it('gives an integer as a number', async () => {
    const onValue = vi.fn<(value: unknown) => void>();
    render(<Harness type="integer" initial={7} onValue={onValue} />);
    const input = screen.getByLabelText('Value');
    expect(input).toHaveValue('7');
    await userEvent.type(input, '2');
    expect(onValue).toHaveBeenLastCalledWith(72);
  });

  it('shows a boolean value and gives true or false', async () => {
    const onValue = vi.fn<(value: unknown) => void>();
    render(<Harness type="boolean" initial={true} onValue={onValue} />);
    const toggle = screen.getByRole('switch');
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    expect(onValue).toHaveBeenLastCalledWith(false);
  });

  it('shows the picked enumeration option and gives the new one', async () => {
    const onValue = vi.fn<(value: unknown) => void>();
    render(<Harness type="enumeration" initial="b" options={['a', 'b']} onValue={onValue} />);
    const select = screen.getByLabelText('Value');
    expect(select).toHaveValue('b');
    await userEvent.selectOptions(select, 'a');
    expect(onValue).toHaveBeenLastCalledWith('a');
  });

  it('shows a time value and gives HH:MM text', async () => {
    const onValue = vi.fn<(value: unknown) => void>();
    render(<Harness type="time" initial="09:30" onValue={onValue} />);
    const input = screen.getByLabelText('Value');
    expect(input).toHaveValue('09:30');
    await userEvent.clear(input);
    expect(onValue).toHaveBeenLastCalledWith(undefined);
  });

  it('shows json as text and gives the parsed value', async () => {
    const onValue = vi.fn<(value: unknown) => void>();
    render(<Harness type="json" initial={{ a: 1 }} onValue={onValue} />);
    const input = screen.getByLabelText('Value');
    expect(input).toHaveValue(JSON.stringify({ a: 1 }, null, 2));
    await userEvent.clear(input);
    await userEvent.click(input);
    await userEvent.paste('{"b":2}');
    expect(onValue).toHaveBeenLastCalledWith({ b: 2 });
    expect(copy.invalidJson).toBeTruthy();
  });

  it('follows a value changed from outside', () => {
    const { rerender } = render(
      <FieldValueInput
        node={{ type: 'text', label: 'Value' }}
        value="a"
        onChange={vi.fn<(value: unknown) => void>()}
      />,
    );
    rerender(
      <FieldValueInput
        node={{ type: 'text', label: 'Value' }}
        value="z"
        onChange={vi.fn<(value: unknown) => void>()}
      />,
    );
    expect(screen.getByLabelText('Value')).toHaveValue('z');
  });
});
