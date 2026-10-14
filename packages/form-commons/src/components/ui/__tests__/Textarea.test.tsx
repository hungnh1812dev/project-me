import { createRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { InputValueProps } from '../../../lib/inputContract';
import { Field } from '../../forms/Field';
import { Textarea, type TextareaProps } from '../textarea';

/** A parent that owns the value, as every caller of a controlled input must. */
const Stateful = ({ initial = '', ...props }: Partial<TextareaProps> & { initial?: string }) => {
  const [value, setValue] = useState(initial);
  return <Textarea value={value} onChange={setValue} {...props} />;
};

const noop = () => {};

describe('Textarea', () => {
  it('defaults to 4 rows with vertical resizing only', () => {
    render(<Textarea aria-label="Notes" value="" onChange={noop} />);

    const textarea = screen.getByRole('textbox', { name: 'Notes' });
    expect(textarea).toHaveAttribute('rows', '4');
    expect(textarea).toHaveClass('resize-y');
  });

  it('forwards ref and passes config keys to the DOM', () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(
      <Textarea
        ref={ref}
        aria-label="Notes"
        value=""
        onChange={noop}
        config={{ rows: 8, maxLength: 50, placeholder: 'Write here' }}
      />,
    );

    expect(ref.current).toBe(screen.getByRole('textbox', { name: 'Notes' }));
    expect(ref.current).toHaveAttribute('rows', '8');
    expect(ref.current).toHaveAttribute('maxlength', '50');
    expect(ref.current).toHaveAttribute('placeholder', 'Write here');
  });

  it('renders value', () => {
    render(<Textarea aria-label="Notes" value="Hello" onChange={noop} />);

    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('Hello');
  });

  it('calls onChange once per edit with the new string, never an event', async () => {
    const onChange = vi.fn<(value: string) => void>();
    render(<Textarea aria-label="Notes" value="ab" onChange={onChange} />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), 'c');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('abc');
  });

  it('is controlled: typing changes neither the text nor the count unless the parent updates value', async () => {
    const onChange = vi.fn();
    render(
      <Textarea aria-label="Bio" value="Hi" onChange={onChange} config={{ maxLength: 10 }} />,
    );
    const textarea = screen.getByRole('textbox', { name: 'Bio' });

    await userEvent.type(textarea, 'x');

    expect(onChange).toHaveBeenCalledWith('Hix');
    expect(textarea).toHaveValue('Hi');
    expect(screen.getByText('2 / 10')).toBeInTheDocument();
  });

  it('fires onBlur when focus leaves and submits name with the form', async () => {
    const onBlur = vi.fn();
    const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      return new FormData(event.currentTarget).get('bio');
    });
    render(
      <form onSubmit={onSubmit}>
        <Stateful aria-label="Bio" name="bio" initial="Hello" onBlur={onBlur} />
        <button type="submit">Send</button>
      </form>,
    );

    await userEvent.click(screen.getByRole('textbox', { name: 'Bio' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveReturnedWith('Hello');
  });

  it('shows no counter without maxLength', () => {
    render(<Textarea aria-label="Notes" value="abc" onChange={noop} />);

    expect(screen.queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument();
  });

  it('shows a live "n / max" count from value, linked through aria-describedby', async () => {
    render(
      <Field label="Bio" description="A short bio.">
        <Stateful config={{ maxLength: 10 }} />
      </Field>,
    );
    const textarea = screen.getByLabelText('Bio');

    expect(textarea).toHaveAccessibleDescription('A short bio. 0 / 10');

    await userEvent.type(textarea, 'abc');

    expect(screen.getByText('3 / 10')).toBeInTheDocument();
    expect(textarea).toHaveAccessibleDescription('A short bio. 3 / 10');
  });

  it('turns the count to the warning colour at 90% and announces it only at the limit', async () => {
    render(<Stateful aria-label="Bio" config={{ maxLength: 10 }} initial="12345678" />);
    const count = screen.getByText('8 / 10');
    expect(count).not.toHaveClass('text-warning');
    expect(count).toHaveAttribute('aria-live', 'off');

    await userEvent.type(screen.getByRole('textbox', { name: 'Bio' }), '9');

    expect(screen.getByText('9 / 10')).toHaveClass('text-warning');
    expect(screen.getByText('9 / 10')).toHaveAttribute('aria-live', 'off');

    await userEvent.type(screen.getByRole('textbox', { name: 'Bio' }), '0');

    expect(screen.getByText('10 / 10')).toHaveAttribute('aria-live', 'polite');
  });

  it('follows a value set by the parent', () => {
    const { rerender } = render(
      <Textarea aria-label="Bio" value="hi" onChange={noop} config={{ maxLength: 20 }} />,
    );
    expect(screen.getByText('2 / 20')).toBeInTheDocument();

    rerender(<Textarea aria-label="Bio" value="hello" onChange={noop} config={{ maxLength: 20 }} />);

    expect(screen.getByRole('textbox', { name: 'Bio' })).toHaveValue('hello');
    expect(screen.getByText('5 / 20')).toBeInTheDocument();
  });

  it('ignores typing while disabled and is read-only when readOnly', async () => {
    const onChange = vi.fn();
    render(
      <>
        <Textarea aria-label="Bio" value="" onChange={onChange} disabled />
        <Textarea aria-label="Notes" value="fixed" onChange={onChange} readOnly />
      </>,
    );

    await userEvent.type(screen.getByRole('textbox', { name: 'Bio' }), 'abc');
    await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), 'abc');

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveAttribute('readonly');
  });

  it('types its props on the contract: string value, no defaultValue or native props', () => {
    const props: InputValueProps<string> = { value: 'a', onChange: noop };
    const onChange: TextareaProps['onChange'] = (value) => {
      const typed: string = value;
      return typed;
    };
    render(
      <>
        <Textarea aria-label="A" {...props} onChange={onChange} />
        {/* @ts-expect-error value is required */}
        <Textarea aria-label="B" onChange={noop} />
        {/* @ts-expect-error defaultValue is not part of the contract */}
        <Textarea aria-label="C" value="" onChange={noop} defaultValue="x" />
        {/* @ts-expect-error rows lives in config */}
        <Textarea aria-label="D" value="" onChange={noop} rows={3} />
        {/* @ts-expect-error onChange takes the string, not an event */}
        <Textarea aria-label="E" value="" onChange={(event: React.ChangeEvent) => event} />
        {/* @ts-expect-error config is JSON only */}
        <Textarea aria-label="F" value="" onChange={noop} config={{ placeholder: () => 'x' }} />
      </>,
    );

    expect(screen.getAllByRole('textbox')).toHaveLength(6);
  });
});
