import { useRef } from 'react';

import type { UnsavedChangesGuard } from '@/features/content/hooks/useUnsavedChangesGuard';

import { ConfirmDialog } from './ConfirmDialog';

/**
 * "Discard unsaved changes?" (D10), opened by `useUnsavedChangesGuard` when a navigation would
 * leave a dirty form. Cancel (the initial focus), Escape or the backdrop keep the edits; Discard
 * continues the navigation.
 */
export const UnsavedChangesDialog: React.FC<{ guard: UnsavedChangesGuard }> = ({ guard }) => {
  // Discard closes the dialog too; that close must not reset the navigation it just let through.
  const leaving = useRef(false);
  return (
    <ConfirmDialog
      open={guard.open}
      onOpenChange={(open) => {
        if (open) return;
        if (leaving.current) leaving.current = false;
        else guard.stay();
      }}
      title="Discard unsaved changes?"
      description="You have changes that aren't saved. If you leave now, they're lost."
      confirmLabel="Discard"
      onConfirm={async () => {
        leaving.current = true;
        guard.leave();
      }}
    />
  );
};
UnsavedChangesDialog.displayName = 'UnsavedChangesDialog';
