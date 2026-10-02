import { ConfirmDialog } from '@/components/form/ConfirmDialog';
import { useRevokeAccessToken } from '@/features/settings/hooks/useAccessTokens';
import type { AccessToken } from '@/features/settings/types';

import type { RevealedSecret } from './TokenFormDialog';

export interface RevokeTokenDialogProps {
  token: AccessToken;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once with the new secret after T3 succeeds; the dialog then closes (AC-30). */
  onRevoked: (revealed: RevealedSecret) => void;
}

/**
 * Confirms revoking one token, naming it (AC-7, AC-31), then sends T3 with `{}`. The new secret is
 * read once into the page's state through `onRevoked` and the mutation is reset, so no cache keeps
 * it (AC-33). Errors stay in the dialog (AC-9). Mount it with a fresh `key` per opening.
 */
export const RevokeTokenDialog: React.FC<RevokeTokenDialogProps> = ({
  token,
  open,
  onOpenChange,
  onRevoked,
}) => {
  const revoke = useRevokeAccessToken();

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Revoke token "${token.name}"?`}
      description="The current secret stops working immediately. A new secret will be shown once."
      confirmLabel="Revoke token"
      onConfirm={async () => {
        const revoked = await revoke.mutateAsync(token.documentId);
        onRevoked({ name: revoked.name, secret: revoked.token });
        revoke.reset();
      }}
      error={revoke.error?.message}
    />
  );
};
RevokeTokenDialog.displayName = 'RevokeTokenDialog';
