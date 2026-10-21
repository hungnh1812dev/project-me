import { zodResolver } from '@hookform/resolvers/zod';
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
import { z } from 'zod';

import { Button } from '@/components/ui/button';

import { SelectInput } from './SelectInput';

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

const ROLES = [
  { value: 'r-editor', label: 'Editor' },
  { value: 'r-guest', label: 'Guest' },
  { value: 'r-admin', label: 'Admin', disabled: true },
];

describe('SelectInput', () => {
  it('throws a clear error outside a FormProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() =>
      render(<SelectInput name="roleId" label="Role" options={ROLES} />),
    ).toThrow(/FormProvider/);
  });

  it('shows the Zod error after submit and submits the chosen value', async () => {
    const schema = z.object({ roleId: z.string().min(1, 'Choose a role.') });
    const onValid = vi.fn<(values: z.infer<typeof schema>) => void>();
    render(
      <TestForm<z.infer<typeof schema>>
        options={{
          resolver: zodResolver(schema),
          defaultValues: { roleId: '' },
        }}
        onValid={onValid}
      >
        <SelectInput
          name="roleId"
          label="Role"
          placeholder="Choose a role"
          options={ROLES}
          required
          description="Decides what they can do."
        />
      </TestForm>,
    );
    const select = screen.getByRole('combobox', { name: /Role/ });
    expect(select).toHaveAttribute('aria-required', 'true');
    expect(select).not.toHaveAttribute('required');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAccessibleDescription(
      'Decides what they can do. Choose a role.',
    );

    await userEvent.selectOptions(select, 'Editor');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onValid).toHaveBeenCalledWith(
      { roleId: 'r-editor' },
      expect.anything(),
    );
    expect(select).not.toHaveAttribute('aria-invalid');
  });

  it('renders disabled options as not selectable', () => {
    render(
      <TestForm>
        <SelectInput name="roleId" label="Role" options={ROLES} />
      </TestForm>,
    );
    expect(screen.getByRole('option', { name: 'Admin' })).toBeDisabled();
    expect(screen.queryByRole('option', { name: '' })).not.toBeInTheDocument();
  });
});
