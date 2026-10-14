import type { ReactNode } from 'react';
import { useArgs } from 'storybook/preview-api';

import type { InputValueProps } from '../lib/inputContract';

/**
 * Binds a Playground story's `value` arg to its control (AC-14). Call it in the story's `render`
 * function (Storybook hooks only run there): the returned `onChange` calls the `onChange` action
 * and writes the new value back to the `value` arg, so the canvas and the Controls panel stay in
 * sync.
 */
// oxlint-disable-next-line react/only-export-components -- story-only helper; stories never hot-reload state.
export const useArgsValue = <T,>(
  value: T,
  onChange?: (value: T) => void,
): Pick<InputValueProps<T>, 'value' | 'onChange'> => {
  const [, updateArgs] = useArgs();
  return {
    value,
    onChange: (next: T) => {
      onChange?.(next);
      updateArgs({ value: next });
    },
  };
};

export interface ControlledProps {
  /** The current value, shown as JSON. */
  value: unknown;
  /** The control, already bound with `useArgsValue`. */
  children: ReactNode;
}

/** JSON for the readout, or `undefined` when there is no value. */
const formatValue = (value: unknown): string => JSON.stringify(value) ?? 'undefined';

/**
 * Story layout for Playground stories: the control, then a live "Value:" readout of the current
 * value as JSON (`<output>`, role `status`, name "Value").
 */
export const Controlled: React.FC<ControlledProps> = ({ value, children }) => (
  <div className="flex flex-col gap-4">
    {children}
    <p className="text-muted-foreground text-sm">
      Value:{' '}
      <output aria-label="Value" className="text-foreground font-mono">
        {formatValue(value)}
      </output>
    </p>
  </div>
);
Controlled.displayName = 'Controlled';
