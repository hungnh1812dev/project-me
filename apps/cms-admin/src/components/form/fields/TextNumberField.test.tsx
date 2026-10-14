import { useEffect } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import { SchemaFormContext } from '@/components/form/schemaFormContext';

import { NumberField } from './NumberField';
import { TextField } from './TextField';

interface HarnessProps {
  defaultValues: FieldValues;
  readOnly?: boolean;
  onSubmit?: (values: FieldValues) => void;
  onForm?: (form: UseFormReturn) => void;
  children: React.ReactNode;
}

/** A react-hook-form form like SchemaForm's: FormProvider, the read-only context and a submit button. */
const Harness: React.FC<HarnessProps> = ({
  defaultValues,
  readOnly = false,
  onSubmit = () => {},
  onForm,
  children,
}) => {
  const form = useForm({ defaultValues, mode: 'onTouched' });
  useEffect(() => {
    onForm?.(form);
  }, [form, onForm]);
  return (
    <FormProvider {...form}>
      <SchemaFormContext.Provider value={{ readOnly, announce: () => {} }}>
        <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
          {children}
          <button type="submit">Save</button>
        </form>
      </SchemaFormContext.Provider>
    </FormProvider>
  );
};

describe('TextField on RHFField (AC-19)', () => {
  it('shows the form value, submits typed text and follows reset()', async () => {
    const onSubmit = vi.fn();
    let form: UseFormReturn | undefined;
    render(
      <Harness defaultValues={{ title: 'Hello' }} onSubmit={onSubmit} onForm={(f) => (form = f)}>
        <TextField label="Title" name="title" />
      </Harness>,
    );
    const input = screen.getByRole('textbox', { name: 'Title' });
    expect(input).toHaveValue('Hello');

    await userEvent.type(input, '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ title: 'Hello!' });

    act(() => form?.reset({ title: 'Saved' }));
    expect(input).toHaveValue('Saved');
  });

  it('shows a missing value as empty text', () => {
    render(
      <Harness defaultValues={{}}>
        <TextField label="Title" name="title" />
      </Harness>,
    );

    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('');
  });

  it('cannot be edited in read-only mode', async () => {
    render(
      <Harness defaultValues={{ title: 'Hello' }} readOnly>
        <TextField label="Title" name="title" />
      </Harness>,
    );
    const input = screen.getByRole('textbox', { name: 'Title' });

    await userEvent.type(input, 'x');

    expect(input).toHaveAttribute('readonly');
    expect(input).toHaveValue('Hello');
  });
});

describe('NumberField on RHFField (AC-19)', () => {
  const field = { name: 'views', type: 'number' } as const;

  it('keeps decimal input mode, autocomplete off and monospace digits', () => {
    render(
      <Harness defaultValues={{ views: '3' }}>
        <NumberField field={field} label="Views" name="views" />
      </Harness>,
    );
    const input = screen.getByRole('textbox', { name: 'Views' });

    expect(input).toHaveValue('3');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('inputmode', 'decimal');
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(input).toHaveClass('font-mono', 'tabular-nums');
  });

  it('shows "Enter a number." from rules on submit, focuses the field and clears it once fixed', async () => {
    const onSubmit = vi.fn();
    render(
      <Harness defaultValues={{ views: '' }} onSubmit={onSubmit}>
        <NumberField field={field} label="Views" name="views" />
      </Harness>,
    );
    const input = screen.getByRole('textbox', { name: 'Views' });

    await userEvent.type(input, '1x');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a number.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.type(input, '{Backspace}');
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('cannot be edited in read-only mode', async () => {
    render(
      <Harness defaultValues={{ views: '3' }} readOnly>
        <NumberField field={field} label="Views" name="views" />
      </Harness>,
    );
    const input = screen.getByRole('textbox', { name: 'Views' });

    await userEvent.type(input, '4');

    expect(input).toHaveAttribute('readonly');
    expect(input).toHaveValue('3');
  });
});
