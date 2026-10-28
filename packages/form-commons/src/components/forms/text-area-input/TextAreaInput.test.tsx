import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { TestForm } from '../../../../test/TestForm.fixture';
import { TextAreaInput } from './TextAreaInput';

describe('TextAreaInput', () => {
  it('throws a clear error outside a FormProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<TextAreaInput name="a" label="A" />)).toThrow(
      /FormProvider/,
    );
  });

  it('submits multi-line text', async () => {
    const onValid = vi.fn<(values: { a: string }) => void>();
    render(
      <TestForm<{ a: string }>
        options={{ defaultValues: { a: '' } }}
        onValid={onValid}
      >
        <TextAreaInput name="a" label="Notes" />
      </TestForm>,
    );
    await userEvent.type(screen.getByLabelText('Notes'), 'one{Enter}two');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onValid).toHaveBeenCalledWith({ a: 'one\ntwo' }, expect.anything());
  });

  it('links a required error through aria-describedby', async () => {
    render(
      <TestForm<{ a: string }> options={{ defaultValues: { a: '' } }}>
        <TextAreaInput
          name="a"
          label="Notes"
          rules={{ required: 'Add some notes.' }}
        />
      </TestForm>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const box = screen.getByLabelText(/Notes/);
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(box).toHaveAccessibleDescription('Add some notes.');
  });
});
