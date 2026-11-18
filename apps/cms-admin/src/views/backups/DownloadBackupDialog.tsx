import { useState } from 'react';
import { Button, FormAlert } from '@abyss/form-commons';
import { Modal, ModalActions } from '@components/Modal';
import { APP_ROUTES } from '@configs/App.routes';
import { useScreenText } from '@configs/locales';
import { useCurrentUser, useEmailCode } from '@features/auth';
import type { BackupFile } from '@features/backups/Backups.api';
import { useBackupsApi } from '@features/backups/BackupsApi.context';
import { ConfirmWithCodeForm, useSecurityApi } from '@features/security';
import { Link } from 'react-router';

/**
 * Asks for the password and a 2FA code, then sends the browser to the
 * one-minute link. The link lives in a local variable only: not in state,
 * the query cache or any log. Without 2FA the form is replaced by a pointer
 * to the security settings.
 */
export function DownloadBackupDialog({
  backup,
  onClose,
  onCloseAutoFocus,
}: {
  backup: BackupFile;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const copy = useScreenText('backups').backups.dialog;
  const api = useBackupsApi();
  const security = useSecurityApi();
  const user = useCurrentUser();
  const method = user?.twoFactorEnabled ? user.twoFactorMethod : null;
  const emailCode = useEmailCode(security.sendEmailCode, method === 'email');
  const [isTwoFactorOff, setIsTwoFactorOff] = useState(false);

  return (
    <Modal
      title={copy.title(backup.fileName)}
      description={copy.description}
      onClose={onClose}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      {method === null || isTwoFactorOff ? (
        <div className="grid gap-4">
          <FormAlert tone="info">{copy.twoFactorOff}</FormAlert>
          <ModalActions>
            <Button type="button" onClick={onClose}>
              {copy.close}
            </Button>
            <Button asChild variant="primary">
              <Link to={APP_ROUTES.SECURITY_SETTINGS}>{copy.openSecurity}</Link>
            </Button>
          </ModalActions>
        </div>
      ) : (
        <ConfirmWithCodeForm
          method={method}
          submit={async (values) => {
            const link = await api.createDownloadLink({
              key: backup.key,
              ...values,
            });
            window.location.assign(link.url);
          }}
          submitLabel={copy.submit}
          submitVariant="primary"
          cancelLabel={copy.cancel}
          onCancel={onClose}
          onDone={onClose}
          onStateChanged={() => setIsTwoFactorOff(true)}
          {...(method === 'email' ? { emailCode } : {})}
        >
          {method === 'email' && emailCode.sentCount > 0 ? (
            <p className="text-sm text-muted-foreground">{copy.emailCodeSent}</p>
          ) : null}
        </ConfirmWithCodeForm>
      )}
    </Modal>
  );
}
