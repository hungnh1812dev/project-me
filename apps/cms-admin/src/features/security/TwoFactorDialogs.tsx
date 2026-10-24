import { Button, FormAlert } from '@abyss/form-commons';
import { useMutation } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef } from 'react';

import { Modal, ModalActions } from '../../components/Modal';
import {
  TOTP_QR_SIZE_PX,
  TOTP_SECRET_GROUP_SIZE,
  type TwoFactorMethod,
} from '../../config/auth.constants';
import { COPY } from '../../config/copy.constants';
import { useEmailCode } from '../auth/use-email-code';
import { ConfirmWithCodeForm } from './ConfirmWithCodeForm';
import { useSecurityApi } from './security-api-context';
import { toSecurityError } from './security-error';

const copy = COPY.security;
const SECRET_GROUPS = new RegExp(`.{1,${TOTP_SECRET_GROUP_SIZE}}`, 'g');

/** Shared props: close without change, finish, or 2FA changed elsewhere. */
interface DialogProps {
  onClose: () => void;
  onDone: () => void;
  onStateChanged: () => void;
}

/** "ABCD EFGH …": easier to type into an app by hand. */
function groupSecret(secret: string): string {
  return secret.match(SECRET_GROUPS)?.join(' ') ?? secret;
}

/**
 * TOTP setup (T13): a fresh secret on open, shown as QR and key; turning on
 * needs the app's current code and the password.
 */
export function TotpSetupDialog({
  onClose,
  onDone,
  onStateChanged,
}: DialogProps) {
  const security = useSecurityApi();
  const setup = useMutation({ mutationFn: security.setupTotp });
  const { mutate: startSetup } = setup;
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startSetup();
  }, [startSetup]);

  const setupError = setup.error === null ? null : toSecurityError(setup.error);
  useEffect(() => {
    if (setupError?.kind === 'state-changed') onStateChanged();
  }, [setupError?.kind, onStateChanged]);

  return (
    <Modal title={copy.totpSetup.title} onClose={onClose}>
      {setup.data === undefined ? (
        setup.isError ? (
          <>
            <FormAlert
              tone={setupError?.kind === 'alert' ? setupError.tone : 'error'}
            >
              {setupError?.kind === 'alert'
                ? setupError.message
                : copy.totpSetup.loadFailed}
            </FormAlert>
            <ModalActions>
              <Button type="button" onClick={onClose}>
                {copy.totpSetup.cancel}
              </Button>
              <Button variant="primary" onClick={() => startSetup()}>
                {copy.totpSetup.retry}
              </Button>
            </ModalActions>
          </>
        ) : (
          <div
            aria-live="polite"
            aria-busy="true"
            className="grid justify-items-start gap-3"
          >
            <span className="sr-only">{copy.totpSetup.loading}</span>
            <div className="size-44 animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
          </div>
        )
      ) : (
        <ConfirmWithCodeForm
          method="totp"
          submit={(values) =>
            security.enableTwoFactor({ method: 'totp', ...values })
          }
          submitLabel={copy.totpSetup.submit}
          submitVariant="primary"
          cancelLabel={copy.totpSetup.cancel}
          onCancel={onClose}
          onDone={onDone}
          onStateChanged={onStateChanged}
          onSetupExpired={() => startSetup()}
        >
          <div className="grid gap-3 text-sm">
            <p>{copy.totpSetup.scanStep}</p>
            <div className="w-fit rounded-md border border-border bg-card p-3 text-foreground">
              <QRCodeSVG
                value={setup.data.otpauthUri}
                size={TOTP_QR_SIZE_PX}
                fgColor="currentColor"
                bgColor="transparent"
                title={copy.totpSetup.qrLabel}
              />
            </div>
            <div className="grid gap-1">
              <p className="text-muted-foreground">
                {copy.totpSetup.manualKeyLabel}
              </p>
              <code
                data-testid="totp-secret"
                className="w-fit rounded bg-muted px-2 py-1 font-mono text-sm break-all select-all"
              >
                {groupSecret(setup.data.secret)}
              </code>
            </div>
            <p>{copy.totpSetup.codeStep}</p>
          </div>
        </ConfirmWithCodeForm>
      )}
    </Modal>
  );
}

/** Email 2FA (Q3): weaker, so the dialog says so; the first code goes out on open. */
export function EmailTwoFactorDialog({
  email,
  onClose,
  onDone,
  onStateChanged,
}: DialogProps & { email: string }) {
  const security = useSecurityApi();
  const emailCode = useEmailCode(security.sendEmailCode, true);
  return (
    <Modal
      title={copy.emailSetup.title}
      description={copy.emailSetup.description(email)}
      onClose={onClose}
    >
      <ConfirmWithCodeForm
        method="email"
        submit={(values) =>
          security.enableTwoFactor({ method: 'email', ...values })
        }
        submitLabel={copy.emailSetup.submit}
        submitVariant="primary"
        cancelLabel={copy.emailSetup.cancel}
        onCancel={onClose}
        onDone={onDone}
        onStateChanged={onStateChanged}
        emailCode={emailCode}
      >
        <FormAlert tone="warning">{copy.twoFactor.emailWarning}</FormAlert>
      </ConfirmWithCodeForm>
    </Modal>
  );
}

/** Turning 2FA off: risky but reversible, so a warning-styled confirm. */
export function DisableTwoFactorDialog({
  method,
  onClose,
  onDone,
  onStateChanged,
}: DialogProps & { method: TwoFactorMethod }) {
  const security = useSecurityApi();
  const emailCode = useEmailCode(security.sendEmailCode, method === 'email');
  return (
    <Modal
      title={copy.disable.title}
      description={copy.disable.description}
      onClose={onClose}
    >
      <ConfirmWithCodeForm
        method={method}
        submit={security.disableTwoFactor}
        submitLabel={copy.disable.submit}
        submitVariant="warning"
        cancelLabel={copy.disable.cancel}
        onCancel={onClose}
        onDone={onDone}
        onStateChanged={onStateChanged}
        {...(method === 'email' ? { emailCode } : {})}
      >
        {method === 'email' && emailCode.sentCount > 0 ? (
          <p className="text-sm text-muted-foreground">
            {copy.disable.emailCodeSent}
          </p>
        ) : null}
      </ConfirmWithCodeForm>
    </Modal>
  );
}
