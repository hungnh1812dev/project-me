import { useEffect, useReducer, type ReactNode } from 'react';
import { useArgs } from 'storybook/preview-api';

import type { InputValueProps } from '../lib/inputContract';

type Bind<T> = Pick<InputValueProps<T>, 'value' | 'onChange'>;

/**
 * Binds a Playground story's `value` arg to its control (AC-14). Call it in the story's `render`
 * function (Storybook hooks only run there): the returned `onChange` calls the `onChange` action
 * and writes the new value back to the `value` arg, so the canvas and the Controls panel stay in
 * sync. Pass the result to `Controlled`.
 */
// oxlint-disable-next-line react/only-export-components -- story-only helper; stories never hot-reload state.
export const useArgsValue = <T,>(value: T, onChange?: (value: T) => void): Bind<T> => {
  const [, updateArgs] = useArgs();
  return {
    value,
    onChange: (next: T) => {
      onChange?.(next);
      updateArgs({ value: next });
    },
  };
};

export interface ControlledProps<T> extends Bind<T> {
  /** Renders the control from the shown value; spread it onto the input. */
  children: (bind: Bind<T>) => ReactNode;
}

/** The shown value, plus the edits written to the arg whose echo hasn't come back yet. */
interface ShownState<T> {
  shown: T;
  sent: T[];
}

type ShownAction<T> = { kind: 'edit'; value: T } | { kind: 'arg'; value: T };

const reduceShown = <T,>(state: ShownState<T>, action: ShownAction<T>): ShownState<T> => {
  if (action.kind === 'edit') return { shown: action.value, sent: [...state.sent, action.value] };
  const echo = state.sent.findIndex((item) => Object.is(item, action.value));
  if (echo >= 0) return { shown: state.shown, sent: state.sent.slice(echo + 1) };
  if (Object.is(state.shown, action.value) && state.sent.length === 0) return state;
  return { shown: action.value, sent: [] };
};

/** JSON for the readout, or `undefined` when there is no value. */
const formatValue = (value: unknown): string => JSON.stringify(value) ?? 'undefined';

/**
 * Story layout for Playground stories: the control, then a live "Value:" readout of the current
 * value as JSON (`<output>`, role `status`, name "Value").
 *
 * `updateArgs` re-renders the story asynchronously, so a text input bound straight to the arg
 * would fall back to the old value between two keystrokes and drop characters. The shown value is
 * therefore React state here, set on every edit. A `value` that is the echo of an edit is skipped;
 * any other `value` (set from the Controls panel or the URL) replaces the shown value.
 */
export const Controlled = <T,>({ value, onChange, children }: ControlledProps<T>) => {
  const [state, dispatch] = useReducer(reduceShown<T>, { shown: value, sent: [] });

  useEffect(() => dispatch({ kind: 'arg', value }), [value]);

  const change = (next: T) => {
    dispatch({ kind: 'edit', value: next });
    onChange(next);
  };
  const shown = state.shown;

  return (
    <div className="flex flex-col gap-4">
      {children({ value: shown, onChange: change })}
      <p className="text-muted-foreground text-sm">
        Value:{' '}
        <output aria-label="Value" className="text-foreground font-mono">
          {formatValue(shown)}
        </output>
      </p>
    </div>
  );
};
Controlled.displayName = 'Controlled';
