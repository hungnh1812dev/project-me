'use client';

import { Switch as SwitchPrimitive } from '@base-ui/react/switch';

import { cn } from '../../lib/cn';
import type { InputProps, SwitchConfig } from '../../lib/inputContract';

type SwitchProps = InputProps<boolean, SwitchConfig>;

/**
 * Controlled Base UI Switch rendered as a native `<button role="switch">`, so a sibling
 * `<label htmlFor>` (as `Field` renders) names and toggles it. The parent owns `value` and gets the
 * next boolean through `onChange`. `name` submits "on" through a hidden input while it is on.
 */
const Switch: React.FC<SwitchProps> = ({
  value,
  onChange,
  config: _config,
  className,
  ...field
}) => (
  <SwitchPrimitive.Root
    data-slot="switch"
    nativeButton
    render={<button type="button" />}
    checked={value}
    onCheckedChange={(checked) => onChange(checked)}
    className={cn(
      // The ::after pseudo-element widens the hit area to 44px without changing the layout.
      'peer group/switch focus-visible:outline-ring aria-invalid:ring-destructive aria-invalid:ring-offset-background data-checked:border-primary-ink data-checked:bg-primary data-unchecked:bg-input relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors after:absolute after:-inset-x-1 after:-inset-y-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 aria-invalid:ring-2 aria-invalid:ring-offset-2 data-disabled:cursor-not-allowed data-disabled:opacity-50',
      className,
    )}
    {...field}
  >
    <SwitchPrimitive.Thumb
      data-slot="switch-thumb"
      className="bg-background pointer-events-none block size-5 rounded-full shadow-sm transition-transform data-checked:translate-x-5 data-unchecked:translate-x-0"
    />
  </SwitchPrimitive.Root>
);
Switch.displayName = 'Switch';

export { Switch, type SwitchProps };
