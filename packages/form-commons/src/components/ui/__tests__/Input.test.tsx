import { createRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { InputValueProps } from '../../../lib/inputContract';
import { Field } from '../../forms/Field';
import { Input, type InputProps } from '../input';

/** A parent that owns the value, as every caller of a controlled input must. */
const Stateful = ({ initial = '', ...props }: Partial<InputProps> & { initial?: string }) => {
  const [value, setValue] = useState(initial);
  return <Input value={value} onChange={setValue} {...props} />;
};

const noop = () => {};

describe('Input', () => {
  it('forwards ref and passes config keys to the DOM', () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <Input
        ref={ref}
        aria-label="Email"
        value=""
        onChange={noop}
        config={{
          type: 'email',
          placeholder: 'you@example.com',
          maxLength: 40,
          minLength: 3,
          autoComplete: 'email',
          inputMode: 'email',
          pattern: '.+@.+',
        }}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(ref.current).toBe(input);
    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveAttribute('placeholder', 'you@example.com');
    expect(input).toHaveAttribute('maxlength', '40');
    expect(input).toHaveAttribute('minlength', '3');
    expect(input).toHaveAttribute('autocomplete', 'email');
    expect(input).toHaveAttribute('inputmode', 'email');
    expect(input).toHaveAttribute('pattern', '.+@.+');
  });

  it('defaults to type="text" without a config', () => {
    render(<Input aria-label="Name" value="" onChange={noop} />);

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAttribute('type', 'text');
  });

  it('renders value', () => {
    render(<Input aria-label="Name" value="Jane" onChange={noop} />);

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Jane');
  });

  it('calls onChange once per edit with the new string, never an event', async () => {
    const onChange = vi.fn<(value: string) => void>();
    render(<Input aria-label="Name" value="ab" onChange={onChange} />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'c');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('abc');
  });

  it('is controlled: typing does not change the shown value unless the parent updates value', async () => {
    const onChange = vi.fn();
    render(<Input aria-label="Name" value="Jane" onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Name' });

    await userEvent.type(input, 'x');

    expect(onChange).toHaveBeenCalledWith('Janex');
    expect(input).toHaveValue('Jane');
  });

  it('shows typed text when the parent updates value', async () => {
    render(<Stateful aria-label="Name" />);
    const input = screen.getByRole('textbox', { name: 'Name' });

    await userEvent.type(input, 'Jane');

    expect(input).toHaveValue('Jane');
  });

  it('fires onBlur when focus leaves', async () => {
    const onBlur = vi.fn();
    render(<Input aria-label="Name" value="" onChange={noop} onBlur={onBlur} />);

    await userEvent.click(screen.getByRole('textbox', { name: 'Name' }));
    await userEvent.tab();

    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('submits name with the form', async () => {
    const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      return new FormData(event.currentTarget).get('title');
    });
    render(
      <form onSubmit={onSubmit}>
        <Stateful aria-label="Title" name="title" initial="Hello" />
        <button type="submit">Send</button>
      </form>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).toHaveReturnedWith('Hello');
  });

  it('renders the leading and trailing slots around the input', () => {
    render(
      <Input
        aria-label="Search"
        value=""
        onChange={noop}
        config={{ type: 'search' }}
        leading={<span data-testid="lead" />}
        trailing={<button type="button">Clear</button>}
      />,
    );

    expect(screen.getByTestId('lead')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveClass('pl-10', 'pr-12');
  });

  it('ignores typing while disabled', async () => {
    const onChange = vi.fn();
    render(<Input aria-label="Name" value="" onChange={onChange} disabled />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'abc');

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('');
  });

  it('ignores typing while readOnly', async () => {
    const onChange = vi.fn();
    render(<Input aria-label="Name" value="Jane" onChange={onChange} readOnly />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'x');

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAttribute('readonly');
  });

  it('uses the destructive styles when aria-invalid is set', () => {
    render(<Input aria-label="Name" aria-invalid="true" value="" onChange={noop} />);

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveClass(
      'aria-invalid:border-destructive',
    );
  });

  it('takes the Field wiring: id, label, required and aria-invalid', () => {
    render(
      <Field label="Title" error="Required." required>
        <Input value="" onChange={noop} />
      </Field>,
    );

    const input = screen.getByRole('textbox', { name: 'Title' });
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Required.');
  });

  it('types its props on the contract: string value, no defaultValue or native props', () => {
    const props: InputValueProps<string> = { value: 'a', onChange: noop };
    const onChange: InputProps['onChange'] = (value) => {
      const typed: string = value;
      return typed;
    };
    render(
      <>
        <Input aria-label="A" {...props} onChange={onChange} />
        {/* @ts-expect-error value is required */}
        <Input aria-label="B" onChange={noop} />
        {/* @ts-expect-error defaultValue is not part of the contract */}
        <Input aria-label="C" value="" onChange={noop} defaultValue="x" />
        {/* @ts-expect-error placeholder lives in config */}
        <Input aria-label="D" value="" onChange={noop} placeholder="x" />
        {/* @ts-expect-error onChange takes the string, not an event */}
        <Input aria-label="E" value="" onChange={(event: React.ChangeEvent) => event} />
        {/* @ts-expect-error a number is not a string value */}
        <Input aria-label="F" value={1} onChange={noop} />
        {/* @ts-expect-error config is JSON only */}
        <Input aria-label="G" value="" onChange={noop} config={{ placeholder: () => 'x' }} />
      </>,
    );

    expect(screen.getAllByRole('textbox')).toHaveLength(7);
  });
});
