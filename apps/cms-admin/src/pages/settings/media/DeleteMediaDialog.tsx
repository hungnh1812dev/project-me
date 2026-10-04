import { ConfirmDialog } from '@repo/ui/form/ConfirmDialog';

import { useDeleteMedia } from '@/features/settings/hooks/useMedia';
import type { MediaAsset } from '@/features/settings/types';

import { MediaThumbnail } from './MediaThumbnail';

export interface DeleteMediaDialogProps {
  asset: MediaAsset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the success message after M3 succeeds. */
  onDeleted: (message: string) => void;
}

/**
 * Confirms deleting one asset with its thumbnail and file name plus the broken-image note (AC-7,
 * AC-38), then sends M3. Errors stay in the dialog (AC-9). Mount it with a fresh `key` per opening.
 */
export const DeleteMediaDialog: React.FC<DeleteMediaDialogProps> = ({
  asset,
  open,
  onOpenChange,
  onDeleted,
}) => {
  const remove = useDeleteMedia();

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete "${asset.fileName}"?`}
      description="Documents that use this image will show a broken image. This can't be undone."
      confirmLabel="Delete file"
      onConfirm={async () => {
        await remove.mutateAsync(asset.documentId);
        onDeleted(`File "${asset.fileName}" deleted.`);
      }}
      error={remove.error?.message}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="aspect-square w-16 shrink-0 overflow-hidden rounded-md border bg-muted">
          <MediaThumbnail asset={asset} width={64} height={64} />
        </div>
        <p className="min-w-0 truncate text-sm font-medium" title={asset.fileName}>
          {asset.fileName}
        </p>
      </div>
    </ConfirmDialog>
  );
};
DeleteMediaDialog.displayName = 'DeleteMediaDialog';
