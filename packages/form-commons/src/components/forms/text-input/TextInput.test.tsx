import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChangeEvent, FocusEvent, ReactNode } from 'react';
import {
  FormProvider,
  type FieldValues,
  type UseFormProps,
  useForm,
} from 'react-hook-form';
import { vi } from 'vitest';
import { z } from 'zod';

import { Button } from '@/components/ui/Button';

import { TextInput } from './TextInput';

function TestForm<T extends FieldValues>({
  options,
  onValid = () => undefined,
  children,
}: {
  options?: UseFormProps<T>;
  onValid?: (values: T) => void;
  children: ReactNode;
}) {
  const form = useForm<T>(options);
  return (
    <FormProvider {...form}>
      <form
        noValidate
        onSubmit={(event) => void form.handleSubmit(onValid)(event)}
      >
        {children}
        <Button type="submit" variant="primary">
          Save
        </Button>
      </form>
    </FormProvider>
  );
}

describe('TextInput', () => {
  it('throws a clear error outside a FormProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<TextInput name="email" label="Email" />)).toThrow(
      /FormProvider/,
    );
  });

  it('shows the RHF native-rule error and links it via aria-describedby', async () => {
    render(
      <TestForm>
        <TextInput
          name="displayName"
          label="Display name"
          rules={{ required: 'Enter a display name.' }}
        />
      </TestForm>,
    );
    const input = screen.getByLabelText(/Display name/);
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).not.toHaveAttribute('aria-invalid');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a display name.');
    expect(input).toHaveFocus();
  });

  it('shows Zod resolver errors and clears them once fixed', async () => {
    const schema = z.object({
      email: z.email('Enter an email like name@example.com.'),
    });
    const onValid = vi.fn<(values: z.infer<typeof schema>) => void>();
    render(
      <TestForm<z.infer<typeof schema>>
        options={{
          resolver: zodResolver(schema),
          defaultValues: { email: '' },
          mode: 'onTouched',
        }}
        onValid={onValid}
      >
        <TextInput
          name="email"
          label="Email"
          type="email"
          required
          description="We send the invite here."
        />
      </TestForm>,
    );
    const input = screen.getByLabelText(/Email/);

    await userEvent.type(input, 'not-an-email');
    await userEvent.tab();

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(
      'We send the invite here. Enter an email like name@example.com.',
    );
    expect(input).toHaveValue('not-an-email');

    await userEvent.clear(input);
    await userEvent.type(input, 'ada@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).toHaveAccessibleDescription('We send the invite here.');
    expect(onValid).toHaveBeenCalledWith(
      { email: 'ada@example.com' },
      expect.anything(),
    );
  });

  it('supports nested field names', async () => {
    render(
      <TestForm>
        <TextInput
          name="profile.city"
          label="City"
          rules={{
            minLength: { value: 3, message: 'Use at least 3 letters.' },
          }}
        />
      </TestForm>,
    );
    const input = screen.getByLabelText('City');
    await userEvent.type(input, 'Hu');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(input).toHaveAccessibleDescription('Use at least 3 letters.');
  });

  it('calls the caller’s onChange and onBlur as well as RHF’s', async () => {
    const onChange = vi.fn<(event: ChangeEvent<HTMLInputElement>) => void>();
    const onBlur = vi.fn<(event: FocusEvent<HTMLInputElement>) => void>();
    render(
      <TestForm>
        <TextInput
          name="title"
          label="Title"
          onChange={onChange}
          onBlur={onBlur}
        />
      </TestForm>,
    );
    await userEvent.type(screen.getByLabelText('Title'), 'a');
    await userEvent.tab();
    expect(onChange).toHaveBeenCalled();
    expect(onBlur).toHaveBeenCalled();
  });

  it('never sets the native required attribute', () => {
    render(
      <TestForm>
        <TextInput
          name="title"
          label="Title"
          rules={{ required: 'Required.' }}
        />
      </TestForm>,
    );
    expect(screen.getByLabelText(/Title/)).not.toHaveAttribute('required');
  });
});
