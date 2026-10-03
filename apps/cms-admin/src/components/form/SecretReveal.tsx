import { useEffect, useRef, useState } from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';

import { Button } from '@repo/ui/components/button';

import { Field } from '@/components/form/Field';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';

export interface SecretRevealProps {
  /** The one-time secret. The dialog is open while it is set; clear it in `onDone`. */
  secret: string | null;
  /** Done was pressed. The caller clears the secret, which closes the dialog (AC-33). */
  onDone: () => void;
  /**
   * Where focus goes on close. Pass the control that started the flow (New token, Revoke), since
   * the dialog that asked for the secret has already closed.
   */
  finalFocus?: React.RefObject<HTMLElement | null>;
}

const COPIED_MS = 2000;
const COPIED = 'Copied.';
const COPY_FAILED = "Couldn't copy. Select the token and copy it manually.";
const ignoreDismiss = () => {};

/**
 * Shows a one-time secret (AC-34): an `alertdialog` titled "Copy your token now" with the secret in
 * a read-only "Token" input that selects itself on focus. Copy uses the Clipboard API; the result
 * is announced in the dialog's own polite status (the page's region is hidden behind the modal),
 * and a failure selects the text for a manual copy. Only Done closes it: Escape and outside clicks
 * are ignored. The secret is never kept here once the caller clears it.
 */
export const SecretReveal: React.FC<SecretRevealProps> = ({ secret, onDone, finalFocus }) => {
  const [status, setStatus] = useState('');
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  // The next secret starts from a clean state.
  const done = () => {
    clearTimeout(timerRef.current);
    setStatus('');
    setCopied(false);
    onDone();
  };

  const selectSecret = () => {
    inputRef.current?.focus();
    inputRef.current?.select();
  };

  const copy = async () => {
    if (secret === null) return;
    try {
      if (!navigator.clipboard) throw new Error('No clipboard');
      await navigator.clipboard.writeText(secret);
      setStatus(COPIED);
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      setStatus(COPY_FAILED);
      setCopied(false);
      selectSecret();
    }
  };

  return (
    <AlertDialog open={secret !== null} onOpenChange={ignoreDismiss}>
      <AlertDialogContent finalFocus={finalFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>Copy your token now</AlertDialogTitle>
          <AlertDialogDescription>You won&apos;t be able to see it again.</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <Field label="Token">
            <Input
              ref={inputRef}
              value={secret ?? ''}
              readOnly
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              onFocus={(event) => event.currentTarget.select()}
            />
          </Field>
          <p role="status" aria-live="polite" aria-atomic="true" className="text-sm">
            {status}
          </p>
        </div>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => void copy()}>
            {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button onClick={done}>Done</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
SecretReveal.displayName = 'SecretReveal';
