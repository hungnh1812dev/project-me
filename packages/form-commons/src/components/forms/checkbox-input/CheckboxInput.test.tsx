import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import {
  FormProvider,
  type FieldValues,
  type UseFormProps,
  useForm,
} from 'react-hook-form';
import { vi } from 'vitest';

import { Button } from '@/components/ui/Button';

import { CheckboxInput } from './CheckboxInput';

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

describe('CheckboxInput', () => {
  it('throws a clear error outside a FormProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() =>
      render(<CheckboxInput name="notify" label="Notify" />),
    ).toThrow(/FormProvider/);
  });

  it('submits the boolean value toggled through its label', async () => {
    const onValid = vi.fn<(values: { notify: boolean }) => void>();
    render(
      <TestForm<{ notify: boolean }>
        options={{ defaultValues: { notify: false } }}
        onValid={onValid}
      >
        <CheckboxInput name="notify" label="Email the invitee" />
      </TestForm>,
    );
    await userEvent.click(screen.getByText('Email the invitee'));
    expect(
      screen.getByRole('checkbox', { name: 'Email the invitee' }),
    ).toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onValid).toHaveBeenCalledWith({ notify: true }, expect.anything());
  });

  it('shows rule errors linked through aria-describedby', async () => {
    render(
      <TestForm<{ accept: boolean }>
        options={{ defaultValues: { accept: false } }}
      >
        <CheckboxInput
          name="accept"
          label="I understand"
          description="Required before you continue."
          rules={{
            validate: (value: unknown) =>
              value === true || 'Tick the box to continue.',
          }}
        />
      </TestForm>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const box = screen.getByRole('checkbox', { name: 'I understand' });
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(box).toHaveAccessibleDescription(
      'Required before you continue. Tick the box to continue.',
    );
  });
});
