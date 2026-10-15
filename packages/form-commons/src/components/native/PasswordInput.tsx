'use client';

import { useState, type Ref } from 'react';
import { EyeIcon, EyeOffIcon } from 'lucide-react';

import type { InputProps, PasswordInputConfig } from '../../lib/inputContract';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

export type PasswordInputProps = Omit<InputProps<string, PasswordInputConfig>, 'ref'> & {
  ref?: Ref<HTMLInputElement>;
};

/**
 * A controlled password Input on the input contract, with a show/hide toggle (`aria-label` and
 * `aria-pressed`). Only the shown/hidden state is local; the parent owns `value`.
 */
export const PasswordInput: React.FC<PasswordInputProps> = ({ config, ...props }) => {
  const [visible, setVisible] = useState(false);

  return (
    <Input
      {...props}
      config={{
        type: visible ? 'text' : 'password',
        placeholder: config?.placeholder,
        autoComplete: config?.autoComplete,
      }}
      trailing={
        <Button
          variant="ghost"
          size="icon"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          disabled={props.disabled}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
        </Button>
      }
    />
  );
};
PasswordInput.displayName = 'PasswordInput';
