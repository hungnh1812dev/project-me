import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { TestForm } from '../test-form';
import { SwitchInput } from './SwitchInput';

describe('SwitchInput', () => {
  it('throws a clear error outside a FormProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<SwitchInput name="on" label="On" />)).toThrow(
      /FormProvider/,
    );
  });

  it('submits the boolean toggled through its label', async () => {
    const onValid = vi.fn<(values: { on: boolean }) => void>();
    render(
      <TestForm<{ on: boolean }>
        options={{ defaultValues: { on: false } }}
        onValid={onValid}
      >
        <SwitchInput name="on" label="Main CV" />
      </TestForm>,
    );
    const toggle = screen.getByRole('switch', { name: 'Main CV' });
    expect(toggle).not.toBeChecked();
    await userEvent.click(screen.getByText('Main CV'));
    expect(toggle).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onValid).toHaveBeenCalledWith({ on: true }, expect.anything());
  });

  it('can be disabled', () => {
    render(
      <TestForm<{ on: boolean }> options={{ defaultValues: { on: true } }}>
        <SwitchInput name="on" label="Main CV" disabled />
      </TestForm>,
    );
    expect(screen.getByRole('switch', { name: 'Main CV' })).toBeDisabled();
  });
});
