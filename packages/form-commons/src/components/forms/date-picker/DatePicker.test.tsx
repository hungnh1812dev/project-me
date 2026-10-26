import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { TestForm } from '../../../../test/TestForm.fixture';
import { DatePicker, DateTimePicker } from './DatePicker';

describe('DatePicker', () => {
  it('renders a date input and submits YYYY-MM-DD', async () => {
    const onValid = vi.fn<(values: { d: string }) => void>();
    render(
      <TestForm<{ d: string }>
        options={{ defaultValues: { d: '2024-05-06' } }}
        onValid={onValid}
      >
        <DatePicker name="d" label="Start date" />
      </TestForm>,
    );
    const input = screen.getByLabelText('Start date');
    expect(input).toHaveAttribute('type', 'date');
    expect(input).toHaveValue('2024-05-06');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onValid).toHaveBeenCalledWith(
      { d: '2024-05-06' },
      expect.anything(),
    );
  });

  it('shows a required error when cleared', async () => {
    render(
      <TestForm<{ d: string }> options={{ defaultValues: { d: '' } }}>
        <DatePicker
          name="d"
          label="Start date"
          rules={{ required: 'Pick a date.' }}
        />
      </TestForm>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Pick a date.')).toBeInTheDocument();
  });
});

describe('DateTimePicker', () => {
  it('renders a datetime-local input with the local value', () => {
    render(
      <TestForm<{ t: string }>
        options={{ defaultValues: { t: '2024-05-06T09:30' } }}
      >
        <DateTimePicker name="t" label="Publish at" />
      </TestForm>,
    );
    const input = screen.getByLabelText('Publish at');
    expect(input).toHaveAttribute('type', 'datetime-local');
    expect(input).toHaveValue('2024-05-06T09:30');
  });
});
