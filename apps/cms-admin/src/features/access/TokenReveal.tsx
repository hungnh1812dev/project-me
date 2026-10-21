import {
  Button,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@abyss/form-commons';
import { useId, useRef, useState } from 'react';

import { COPY } from '../../config/copy.constants';
import { FormAlert } from '../auth/FormAlert';

const copy = COPY.access.tokenReveal;

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * The raw token, shown once after creation. The only way out is the Done
 * button, so it cannot be dismissed by a stray click or Esc. The parent
 * drops the value when this unmounts.
 */
export function TokenReveal({
  name,
  token,
  onDone,
}: {
  name: string;
  token: string;
  onDone: () => void;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopyState('copied');
    } catch {
      input.current?.select();
      setCopyState('failed');
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{copy.title(name)}</DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
      </DialogHeader>
      <FormAlert tone="warning">{copy.warning}</FormAlert>
      <div className="grid gap-1.5">
        <Label htmlFor={inputId}>{copy.label}</Label>
        <div className="flex gap-2">
          <Input
            id={inputId}
            ref={input}
            readOnly
            value={token}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button type="button" onClick={() => void copyToken()}>
            {copy.copy}
          </Button>
        </div>
        <output
          className={`m-0 block min-h-5 text-sm ${copyState === 'failed' ? 'text-destructive-strong' : 'text-muted-foreground'}`}
        >
          {copyState === 'copied'
            ? copy.copied
            : copyState === 'failed'
              ? copy.copyFailed
              : ''}
        </output>
      </div>
      <DialogFooter>
        <Button type="button" variant="primary" onClick={onDone}>
          {copy.done}
        </Button>
      </DialogFooter>
    </>
  );
}
