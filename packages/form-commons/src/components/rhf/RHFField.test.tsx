import { forwardRef } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm, type UseFormReturn } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import type { InputOption, InputValueProps } from '../../lib/inputContract';
import { parseJson } from '../../lib/json';
import { Field, type FieldControlProps } from '../forms/Field';
import { JsonInput } from '../forms/JsonInput';
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { Switch } from '../ui/switch';
import { RHFField, type RHFFieldRenderProps } from './RHFField';

/** A minimal controlled text input on the contract, so the tests don't depend on `Input`'s API. */
const TextBox = forwardRef<HTMLInputElement, InputValueProps<string> & FieldControlProps>(
  ({ value, onChange, onBlur, name, ...field }, ref) => (
    <input
      ref={ref}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      name={name}
      {...field}
    />
  ),
);
TextBox.displayName = 'TextBox';

type Values = { title: string; published: boolean };

const DEFAULTS: Values = { title: '', published: false };

/** A form that owns `Values` and exposes its `useForm` return to the test. */
const Form = ({
  onSubmit = () => {},
  onForm,
  disabled,
  provider = true,
  children,
}: {
  onSubmit?: (values: Values) => void;
  onForm?: (form: UseFormReturn<Values>) => void;
  disabled?: boolean;
  provider?: boolean;
  children: (form: UseFormReturn<Values>) => React.ReactNode;
}) => {
  const form = useForm<Values>({ defaultValues: DEFAULTS, disabled });
  onForm?.(form);
  const body = (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
      {children(form)}
      <button type="submit">Save</button>
    </form>
  );
  return provider ? <FormProvider {...form}>{body}</FormProvider> : body;
};

describe('RHFField', () => {
  it('renders the same markup as Field (label, description, required mark, aria-*)', () => {
    const plain = render(
      <Field label="Title" description="Shown on the page." id="title" required>
        <TextBox value="" onChange={() => {}} name="title" />
      </Field>,
    );
    const fieldHtml = plain.container.querySelector('[data-slot="field"]')?.outerHTML;
    plain.unmount();
    const { container } = render(
      <Form>
        {() => (
          <RHFField<Values, 'title'>
            name="title"
            label="Title"
            description="Shown on the page."
            id="title"
            rules={{ required: 'Enter a title.' }}
          >
            {(field) => <TextBox {...field} />}
          </RHFField>
        )}
      </Form>,
    );

    expect(fieldHtml).toBeDefined();
    expect(container.querySelector('[data-slot="field"]')?.outerHTML).toBe(fieldHtml);
    const input = screen.getByRole('textbox', { name: 'Title' });
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAccessibleDescription('Shown on the page.');
  });

  it('calls the render prop with value, onChange, onBlur, name, ref and disabled from useController', () => {
    const children = vi.fn((field: RHFFieldRenderProps<Values, 'title'>) => <TextBox {...field} />);
    render(
      <Form disabled>
        {() => (
          <RHFField<Values, 'title'> name="title" label="Title">
            {children}
          </RHFField>
        )}
      </Form>,
    );

    const field = children.mock.lastCall![0];
    expect(Object.keys(field).sort()).toEqual(
      ['disabled', 'name', 'onBlur', 'onChange', 'ref', 'value'].sort(),
    );
    expect(field).toMatchObject({ value: '', name: 'title', disabled: true });
    expect(field.onChange).toBeTypeOf('function');
    expect(field.onBlur).toBeTypeOf('function');
    expect(field.ref).toBeTypeOf('function');
    expect(screen.getByRole('textbox', { name: 'Title' })).toBeDisabled();
  });

  it('shows the rules error as an alert on submit, marks the control invalid and clears it once fixed', async () => {
    const onSubmit = vi.fn();
    render(
      <Form onSubmit={onSubmit}>
        {() => (
          <RHFField<Values, 'title'>
            name="title"
            label="Title"
            rules={{ required: 'Enter a title.' }}
          >
            {(field) => <TextBox {...field} />}
          </RHFField>
        )}
      </Form>,
    );
    const input = screen.getByRole('textbox', { name: 'Title' });

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a title.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a title.');
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.type(input, 'Hello');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(onSubmit).toHaveBeenCalledWith({ title: 'Hello', published: false }, expect.anything());
  });

  it('defaults required to !!rules.required, and an explicit required wins', () => {
    render(
      <Form>
        {() => (
          <>
            <RHFField<Values, 'title'> name="title" label="Title">
              {(field) => <TextBox {...field} />}
            </RHFField>
            <RHFField<Values, 'title'>
              name="title"
              label="Optional title"
              required={false}
              rules={{ required: 'Enter a title.' }}
            >
              {(field) => <TextBox {...field} />}
            </RHFField>
          </>
        )}
      </Form>,
    );

    expect(screen.getByRole('textbox', { name: 'Title' })).not.toBeRequired();
    expect(screen.getByRole('textbox', { name: 'Optional title' })).not.toBeRequired();
  });

  it('shows the value from reset() and setValue() (controlled end to end)', () => {
    let form!: UseFormReturn<Values>;
    render(
      <Form onForm={(f) => (form = f)}>
        {() => (
          <RHFField<Values, 'title'> name="title" label="Title">
            {(field) => <TextBox {...field} />}
          </RHFField>
        )}
      </Form>,
    );
    const input = screen.getByRole('textbox', { name: 'Title' });

    act(() => form.reset({ title: 'From reset', published: false }));
    expect(input).toHaveValue('From reset');

    act(() => form.setValue('title', 'From setValue'));
    expect(input).toHaveValue('From setValue');
  });

  it('binds through an explicit control without a FormProvider', async () => {
    const onSubmit = vi.fn();
    render(
      <Form provider={false} onSubmit={onSubmit}>
        {({ control }) => (
          <RHFField control={control} name="title" label="Title">
            {(field) => <TextBox {...field} />}
          </RHFField>
        )}
      </Form>,
    );

    await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), 'Hi');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith({ title: 'Hi', published: false }, expect.anything());
  });

  it('works with Switch on a boolean path', async () => {
    const onSubmit = vi.fn();
    let form!: UseFormReturn<Values>;
    render(
      <Form onSubmit={onSubmit} onForm={(f) => (form = f)}>
        {({ control }) => (
          <RHFField control={control} name="published" label="Published">
            {(field) => <Switch {...field} />}
          </RHFField>
        )}
      </Form>,
    );
    const toggle = screen.getByRole('switch', { name: 'Published' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({ title: '', published: true }, expect.anything());

    act(() => form.reset({ title: '', published: false }));
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('rejects an input whose value type does not match the path (type test)', () => {
    render(
      <Form>
        {({ control }) => (
          <>
            <RHFField control={control} name="title" label="Title as switch">
              {/* @ts-expect-error Switch takes boolean, the path is string */}
              {(field) => <Switch {...field} />}
            </RHFField>
            <RHFField<Values, 'title'> name="title" label="Title as switch in context">
              {/* @ts-expect-error Switch takes boolean, the path is string */}
              {(field) => <Switch {...field} />}
            </RHFField>
            <RHFField control={control} name="published" label="Published as input">
              {/* @ts-expect-error Input takes string, the path is boolean */}
              {(field) => <Input {...field} />}
            </RHFField>
            {/* @ts-expect-error the path does not exist */}
            <RHFField control={control} name="missing" label="Missing">
              {() => <TextBox value="" onChange={() => {}} />}
            </RHFField>
          </>
        )}
      </Form>,
    );

    expect(screen.getAllByRole('switch')).toHaveLength(2);
  });

  describe('with Select and JsonInput', () => {
    type Settings = { expires: string | null; meta: string };

    const EXPIRES: InputOption[] = [
      { value: '1h', label: '1 hour' },
      { value: '1d', label: '1 day' },
    ];

    /** The JSON text must parse to an object (D-6: the parse message reaches RHFField through rules). */
    const validateMeta = (text: string) => {
      const result = parseJson(text, { required: true, expect: 'object' });
      return result.ok || result.message;
    };

    const SettingsForm = ({
      onSubmit,
      onForm,
    }: {
      onSubmit: (values: Settings) => void;
      onForm?: (form: UseFormReturn<Settings>) => void;
    }) => {
      const form = useForm<Settings>({ defaultValues: { expires: null, meta: '' } });
      onForm?.(form);
      return (
        <FormProvider {...form}>
          <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
            <RHFField<Settings, 'expires'>
              name="expires"
              label="Expires in"
              rules={{ required: 'Pick an expiry.' }}
            >
              {(field) => (
                <Select {...field} config={{ placeholder: 'Choose', options: EXPIRES }} />
              )}
            </RHFField>
            <RHFField<Settings, 'meta'>
              name="meta"
              label="Metadata"
              rules={{ validate: validateMeta }}
            >
              {(field) => <JsonInput {...field} config={{ label: 'Metadata', expect: 'object' }} />}
            </RHFField>
            <button type="submit">Save</button>
          </form>
        </FormProvider>
      );
    };

    const editorText = () =>
      document.querySelector('repo-json-editor')?.shadowRoot?.querySelector('.cm-content')
        ?.textContent;

    it('validates a Select on a string | null path and submits the picked value', async () => {
      const onSubmit = vi.fn();
      let form!: UseFormReturn<Settings>;
      render(<SettingsForm onSubmit={onSubmit} onForm={(f) => (form = f)} />);
      act(() => form.setValue('meta', '{}'));

      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      const select = screen.getByRole('combobox', { name: /Expires in/ });
      expect(await screen.findByRole('alert')).toHaveTextContent('Pick an expiry.');
      expect(select).toHaveAttribute('aria-invalid', 'true');
      expect(select).toHaveAttribute('aria-required', 'true');
      expect(onSubmit).not.toHaveBeenCalled();

      await userEvent.click(select);
      await userEvent.click(await screen.findByRole('option', { name: '1 day' }));
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
      expect(select).toHaveTextContent('1 day');

      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit).toHaveBeenCalledWith({ expires: '1d', meta: '{}' }, expect.anything());

      act(() => form.reset({ expires: '1h', meta: '{}' }));
      expect(select).toHaveTextContent('1 hour');
    });

    it('feeds the JsonInput parse message through rules.validate and submits valid text', async () => {
      const onSubmit = vi.fn();
      let form!: UseFormReturn<Settings>;
      render(<SettingsForm onSubmit={onSubmit} onForm={(f) => (form = f)} />);
      act(() => form.setValue('expires', '1h'));
      await waitFor(() => expect(editorText()).toBe(''));

      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('This field is required.');

      act(() => form.setValue('meta', '[1]'));
      await waitFor(() => expect(editorText()).toBe('[1]'));
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      const expected = parseJson('[1]', { required: true, expect: 'object' });
      expect(expected.ok).toBe(false);
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(expected.ok ? '' : expected.message),
      );
      expect(onSubmit).not.toHaveBeenCalled();

      act(() => form.setValue('meta', '{"a":1}'));
      await waitFor(() => expect(editorText()).toBe('{"a":1}'));
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith(
          { expires: '1h', meta: '{"a":1}' },
          expect.anything(),
        ),
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('rejects Select on a boolean path (type test)', () => {
      render(
        <Form>
          {({ control }) => (
            <RHFField control={control} name="published" label="Published as select">
              {/* @ts-expect-error Select takes string | null, the path is boolean */}
              {(field) => <Select {...field} config={{ options: EXPIRES }} />}
            </RHFField>
          )}
        </Form>,
      );

      expect(screen.getByRole('combobox', { name: 'Published as select' })).toBeInTheDocument();
    });
  });
});
