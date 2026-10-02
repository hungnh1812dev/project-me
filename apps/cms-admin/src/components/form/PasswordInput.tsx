import { useState } from 'react';
import { EyeIcon, EyeOffIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input, type InputProps } from '@/components/ui/input';

export type PasswordInputProps = Omit<InputProps, 'type' | 'trailing'>;

/** A password Input with a show/hide toggle (`aria-label` and `aria-pressed`). */
export const PasswordInput: React.FC<PasswordInputProps> = (props) => {
  const [visible, setVisible] = useState(false);

  return (
    <Input
      {...props}
      type={visible ? 'text' : 'password'}
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
