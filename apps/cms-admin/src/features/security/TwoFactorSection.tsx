import { Button, FormAlert, type FormAlertTone } from '@abyss/form-commons';
import { useCallback, useState } from 'react';

import { COPY } from '../../config/copy.constants';
import { useCurrentUser, useSession } from '../auth';
import {
  DisableTwoFactorDialog,
  EmailTwoFactorDialog,
  TotpSetupDialog,
} from './TwoFactorDialogs';

const copy = COPY.security.twoFactor;

type OpenDialog = 'totp' | 'email' | 'disable' | null;

interface Notice {
  tone: FormAlertTone;
  message: string;
}

/** Status of 2FA plus the actions that change it; each opens a dialog. */
export function TwoFactorSection() {
  const user = useCurrentUser();
  const session = useSession();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const close = useCallback(() => setDialog(null), []);

  /** Re-reads /me, closes the dialog and says what changed. */
  const settle = useCallback(
    async (next: Notice) => {
      setDialog(null);
      setNotice(next);
      try {
        await session.reloadUser();
      } catch {
        // The interceptor signs out if the session is gone; nothing else to do.
      }
    },
    [session],
  );

  const onStateChanged = useCallback(
    () =>
      void settle({ tone: 'info', message: COPY.security.errors.stateChanged }),
    [settle],
  );

  if (user === null) return null;
  const method = user.twoFactorEnabled ? user.twoFactorMethod : null;

  return (
    <section
      aria-labelledby="two-factor-heading"
      className="grid gap-4 rounded-md border border-border bg-card p-5"
    >
      <div className="grid gap-1">
        <h2 id="two-factor-heading" className="text-base font-semibold">
          {copy.title}
        </h2>
        <p className="text-sm text-muted-foreground">{copy.description}</p>
      </div>

      {notice !== null ? (
        <FormAlert tone={notice.tone}>{notice.message}</FormAlert>
      ) : null}

      <dl className="flex items-center gap-3 text-sm">
        <dt className="text-muted-foreground">{copy.statusLabel}</dt>
        <dd>
          <span
            className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium ${
              method === null
                ? 'bg-muted text-muted-foreground'
                : 'bg-success-soft text-success-strong'
            }`}
          >
            {method === 'totp'
              ? copy.statusTotp
              : method === 'email'
                ? copy.statusEmail
                : copy.statusOff}
          </span>
        </dd>
      </dl>

      {method === null ? (
        <>
          <p className="text-sm">{copy.offHint}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button onClick={() => setDialog('totp')}>{copy.setUpTotp}</Button>
            <Button
              variant="link"
              className="h-auto px-0"
              onClick={() => setDialog('email')}
            >
              {copy.emailInstead}
            </Button>
          </div>
        </>
      ) : (
        <>
          {method === 'email' ? (
            <FormAlert tone="warning">{copy.emailWarning}</FormAlert>
          ) : null}
          <div>
            <Button variant="warning" onClick={() => setDialog('disable')}>
              {copy.turnOff}
            </Button>
          </div>
        </>
      )}

      {dialog === 'totp' ? (
        <TotpSetupDialog
          onClose={close}
          onDone={() =>
            void settle({ tone: 'success', message: copy.enabledTotp })
          }
          onStateChanged={onStateChanged}
        />
      ) : null}
      {dialog === 'email' ? (
        <EmailTwoFactorDialog
          email={user.email}
          onClose={close}
          onDone={() =>
            void settle({ tone: 'success', message: copy.enabledEmail })
          }
          onStateChanged={onStateChanged}
        />
      ) : null}
      {dialog === 'disable' && method !== null ? (
        <DisableTwoFactorDialog
          method={method}
          onClose={close}
          onDone={() =>
            void settle({ tone: 'success', message: copy.disabled })
          }
          onStateChanged={onStateChanged}
        />
      ) : null}
    </section>
  );
}
