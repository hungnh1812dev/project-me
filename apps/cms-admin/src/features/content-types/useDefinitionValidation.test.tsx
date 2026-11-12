import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContentTypesApi, DefinitionValidation } from './ContentTypes.api';
import { SCHEMA_VALIDATE_DEBOUNCE_MS } from './ContentTypes.constants';
import { ContentTypesApiProvider } from './ContentTypesApi.context';
import { useDefinitionValidation } from './useDefinitionValidation';

const VALID: DefinitionValidation = { valid: true, errors: [] };
const INVALID: DefinitionValidation = {
  valid: false,
  errors: [{ path: ['fields', 0, 'name'], rule: 'name-format', message: 'Bad name' }],
};

const initialProps: { definition: object | null } = { definition: { slug: 'a' } };

function setup(validateDefinition: ContentTypesApi['validateDefinition']) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ContentTypesApiProvider api={{ validateDefinition }}>{children}</ContentTypesApiProvider>
  );
  return renderHook(
    ({ definition }: { definition: object | null }) =>
      useDefinitionValidation(definition, 'create'),
    { wrapper, initialProps },
  );
}

const pause = () => act(() => vi.advanceTimersByTimeAsync(SCHEMA_VALIDATE_DEBOUNCE_MS));

describe('useDefinitionValidation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is idle and sends nothing without a definition', async () => {
    const validate = vi.fn<ContentTypesApi['validateDefinition']>();
    const { result, rerender } = setup(validate);
    rerender({ definition: null });
    await pause();
    expect(result.current.status).toBe('idle');
    expect(result.current.isResultCurrent).toBe(false);
    expect(validate).not.toHaveBeenCalled();
  });

  it('sends one call per pause, with the whole request', async () => {
    const validate = vi.fn<ContentTypesApi['validateDefinition']>().mockResolvedValue(VALID);
    const { result, rerender } = setup(validate);
    rerender({ definition: { slug: 'ab' } });
    await act(() => vi.advanceTimersByTimeAsync(SCHEMA_VALIDATE_DEBOUNCE_MS - 1));
    rerender({ definition: { slug: 'abc' } });
    await act(() => vi.advanceTimersByTimeAsync(SCHEMA_VALIDATE_DEBOUNCE_MS - 1));
    expect(validate).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(validate).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenCalledWith({ definition: { slug: 'abc' }, mode: 'create' });
    expect(result.current.status).toBe('checked');
    expect(result.current.isResultCurrent).toBe(true);
  });

  it('keeps the stale result, not current, while a newer check runs', async () => {
    const validate = vi.fn<ContentTypesApi['validateDefinition']>().mockResolvedValueOnce(INVALID);
    const { result, rerender } = setup(validate);
    await pause();
    expect(result.current.validation).toEqual(INVALID);

    rerender({ definition: { slug: 'b' } });
    expect(result.current.status).toBe('checking');
    expect(result.current.validation).toEqual(INVALID);
    expect(result.current.isResultCurrent).toBe(false);

    validate.mockResolvedValueOnce(VALID);
    await pause();
    expect(result.current.validation).toEqual(VALID);
    expect(result.current.isResultCurrent).toBe(true);
  });

  it.each([
    ['500', { response: { status: 500 } }],
    ['429', { response: { status: 429 } }],
    ['network', new Error('Network Error')],
  ])('is unavailable on %s, then succeeds after retry', async (_name, error) => {
    const validate = vi
      .fn<ContentTypesApi['validateDefinition']>()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(VALID);
    const { result } = setup(validate);
    await pause();
    expect(result.current.status).toBe('unavailable');
    expect(result.current.isResultCurrent).toBe(false);
    await pause();
    expect(validate).toHaveBeenCalledTimes(1);

    act(() => result.current.retry());
    expect(result.current.status).toBe('checking');
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(validate).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('checked');
    expect(result.current.isResultCurrent).toBe(true);
  });

  it('does not retry a 4xx by itself', async () => {
    const validate = vi
      .fn<ContentTypesApi['validateDefinition']>()
      .mockRejectedValue({ response: { status: 400 } });
    const { result } = setup(validate);
    await act(() => vi.advanceTimersByTimeAsync(SCHEMA_VALIDATE_DEBOUNCE_MS * 5));
    expect(validate).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('unavailable');
  });

  it('ignores an answer that arrives after a newer edit', async () => {
    let resolveFirst: (value: DefinitionValidation) => void = () => {};
    const validate = vi
      .fn<ContentTypesApi['validateDefinition']>()
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(VALID);
    const { result, rerender } = setup(validate);
    await pause();
    rerender({ definition: { slug: 'b' } });
    await act(() => Promise.resolve(resolveFirst(INVALID)));
    expect(result.current.validation).toBeNull();
    await pause();
    expect(result.current.validation).toEqual(VALID);
  });
});
