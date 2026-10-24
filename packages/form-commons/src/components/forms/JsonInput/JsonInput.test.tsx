import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { TestForm } from '../../../../test/test-form';
import { isValidJsonText, JsonInput } from './JsonInput';

describe('isValidJsonText', () => {
  it.each(['', '  ', '{"a":1}', '[1,2]', 'null', '"x"'])(
    'accepts %j',
    (text) => {
      expect(isValidJsonText(text)).toBe(true);
    },
  );
  it.each(['{', "{'a':1}", 'undefined', '[1,]'])('rejects %j', (text) => {
    expect(isValidJsonText(text)).toBe(false);
  });
});

describe('JsonInput', () => {
  it('reports invalid JSON and blocks submit', async () => {
    const onValid = vi.fn<(values: { j: string }) => void>();
    render(
      <TestForm<{ j: string }>
        options={{ defaultValues: { j: '' } }}
        onValid={onValid}
      >
        <JsonInput
          name="j"
          label="Tech stack"
          invalidMessage="Enter valid JSON."
        />
      </TestForm>,
    );
    await userEvent.type(screen.getByLabelText('Tech stack'), 'not json');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Enter valid JSON.')).toBeInTheDocument();
    expect(onValid).not.toHaveBeenCalled();
  });

  it('submits valid JSON text unchanged, and allows blank', async () => {
    const onValid = vi.fn<(values: { j: string }) => void>();
    render(
      <TestForm<{ j: string }>
        options={{ defaultValues: { j: '' } }}
        onValid={onValid}
      >
        <JsonInput
          name="j"
          label="Tech stack"
          invalidMessage="Enter valid JSON."
        />
      </TestForm>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onValid).toHaveBeenLastCalledWith({ j: '' }, expect.anything());
    await userEvent.type(screen.getByLabelText('Tech stack'), '[["a"]');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onValid).toHaveBeenLastCalledWith({ j: '["a"]' }, expect.anything());
  });
});
