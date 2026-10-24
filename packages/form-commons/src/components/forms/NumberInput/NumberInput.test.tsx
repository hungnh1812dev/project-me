import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { TestForm } from '../../../../test/test-form';
import { NumberInput } from './NumberInput';

describe('NumberInput', () => {
  it('throws a clear error outside a FormProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() =>
      render(
        <NumberInput name="n" label="N" mode="integer" invalidMessage="Bad" />,
      ),
    ).toThrow(/FormProvider/);
  });

  it('keeps a value beyond 2^53 as the exact typed string', async () => {
    const onValid = vi.fn<(values: { n: string }) => void>();
    render(
      <TestForm<{ n: string }>
        options={{ defaultValues: { n: '' } }}
        onValid={onValid}
      >
        <NumberInput
          name="n"
          label="Size"
          mode="integer"
          invalidMessage="Bad"
        />
      </TestForm>,
    );
    await userEvent.type(screen.getByLabelText('Size'), '9007199254740993');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onValid).toHaveBeenCalledWith(
      { n: '9007199254740993' },
      expect.anything(),
    );
  });

  it('rejects text that is not a whole number in integer mode', async () => {
    render(
      <TestForm<{ n: string }> options={{ defaultValues: { n: '' } }}>
        <NumberInput
          name="n"
          label="Size"
          mode="integer"
          invalidMessage="Whole numbers only."
        />
      </TestForm>,
    );
    await userEvent.type(screen.getByLabelText('Size'), '1.5');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Whole numbers only.')).toBeInTheDocument();
    expect(screen.getByLabelText('Size')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('accepts a fractional part in decimal mode and allows an empty value', async () => {
    const onValid = vi.fn<(values: { n: string }) => void>();
    render(
      <TestForm<{ n: string }>
        options={{ defaultValues: { n: '' } }}
        onValid={onValid}
      >
        <NumberInput
          name="n"
          label="Price"
          mode="decimal"
          invalidMessage="Bad"
        />
      </TestForm>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onValid).toHaveBeenCalledTimes(1);
    await userEvent.type(screen.getByLabelText('Price'), '-12.50');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onValid).toHaveBeenLastCalledWith(
      { n: '-12.50' },
      expect.anything(),
    );
  });
});
