import { useRef, useState } from 'react';
import { TriangleAlertIcon } from 'lucide-react';

import { Button } from '@repo/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/dialog';
import { Input } from '@repo/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/select';

import { Field } from '@/components/form/Field';
import { PermissionTree } from '@/components/form/PermissionTree';
import { useCreateAccessToken } from '@/features/settings/hooks/useAccessTokens';
import { usePermissions } from '@/features/settings/hooks/usePermissions';
import { EXPIRES_IN_OPTIONS, type ExpiresIn } from '@/features/settings/types';
import { validateTokenName } from '@/features/settings/validation';

/** What the page needs to reveal a new token: its name and the one-time secret. */
export interface RevealedSecret {
  name: string;
  secret: string;
}

export interface TokenFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once with the new secret after T2 succeeds; the dialog then closes (AC-30). */
  onCreated: (revealed: RevealedSecret) => void;
}

const DEFAULT_EXPIRES_IN: ExpiresIn = '1m';
const NO_PERMISSIONS = "A token with no permissions can't call any protected endpoint.";
const EXPIRES_ITEMS = EXPIRES_IN_OPTIONS.map(({ value, label }) => ({ value, label }));

/**
 * Creates an access token (AC-29): Name (1–100 characters), an Expires Select (default "1 month",
 * D6) and the PermissionTree. An empty permission set shows a warning but stays allowed. On
 * success the secret is read once from T2's result into the page's state through `onCreated`, the
 * mutation is reset so no cache keeps it (AC-33), and the page shows the SecretReveal (AC-30).
 * Server errors show as an alert (AC-9). Mount it with a fresh `key` per opening.
 */
export const TokenFormDialog: React.FC<TokenFormDialogProps> = ({
  open,
  onOpenChange,
  onCreated,
}) => {
  const create = useCreateAccessToken();
  const catalog = usePermissions();
  const [name, setName] = useState('');
  const [expiresIn, setExpiresIn] = useState<ExpiresIn>(DEFAULT_EXPIRES_IN);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [nameError, setNameError] = useState<string | undefined>();
  const [submitted, setSubmitted] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    const created = await create.mutateAsync({
      name: name.trim(),
      permissions: [...new Set(permissions)],
      expiresIn,
    });
    onCreated({ name: created.name, secret: created.token });
    create.reset();
    onOpenChange(false);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (create.isPending) return;
    const error = validateTokenName(name);
    setSubmitted(true);
    setNameError(error);
    if (error) return;
    // The failure is shown from the mutation's `error`.
    save().catch(() => {});
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!create.isPending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-2xl" initialFocus={nameRef}>
        <DialogHeader>
          <DialogTitle>New token</DialogTitle>
          <DialogDescription>
            Give a script or service its own key, limited to the permissions it needs.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required error={nameError}>
              <Input
                ref={nameRef}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (submitted) setNameError(validateTokenName(event.target.value));
                }}
                autoComplete="off"
              />
            </Field>
            <Select
              items={EXPIRES_ITEMS}
              value={expiresIn}
              onValueChange={(value) => {
                if (value) setExpiresIn(value);
              }}
            >
              <Field label="Expires">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
              </Field>
              <SelectContent>
                {EXPIRES_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <PermissionTree
            value={permissions}
            onChange={setPermissions}
            catalog={catalog.data}
            canReadCatalog={catalog.decision.allowed}
            isLoading={catalog.isPending && catalog.decision.allowed}
            error={catalog.error?.message}
            onRetry={() => void catalog.refetch()}
          />
          <div aria-live="polite">
            {permissions.length === 0 && (
              <p className="flex items-center gap-2 text-sm text-warning">
                <TriangleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
                {NO_PERMISSIONS}
              </p>
            )}
          </div>
          {create.error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {create.error.message}
            </p>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" loading={create.isPending}>
              Create token
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
TokenFormDialog.displayName = 'TokenFormDialog';
