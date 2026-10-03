import { useMemo, useState } from 'react';

import { FileDropzone } from '@/components/form/FileDropzone';
import { GatedButton } from '@/components/form/GatedButton';
import { useCan } from '@/features/auth/hooks/useCan';
import { ListState } from '@/features/settings/components/ListState';
import { LiveRegion } from '@/features/settings/components/LiveRegion';
import { SearchField } from '@/features/settings/components/SearchField';
import { useAnnouncer } from '@/features/settings/components/useAnnouncer';
import { useMediaList, useUploadMedia } from '@/features/settings/hooks/useMedia';
import { formatBytes, UPLOAD_ACCEPT, uploadSummary } from '@/features/settings/media';
import { filterBySearch } from '@/features/settings/search';
import type { MediaAsset } from '@/features/settings/types';

import { DeleteMediaDialog } from './media/DeleteMediaDialog';
import { MediaThumbnail } from './media/MediaThumbnail';

const NOUN = { one: 'file', other: 'files' };
const SEARCH_FIELDS = ['fileName'] as const;
const DATE = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

interface CardProps {
  asset: MediaAsset;
  onDelete: (asset: MediaAsset) => void;
}

/** One asset: a lazy thumbnail in a fixed square, the truncated name, details and Delete (AC-35). */
const MediaCard: React.FC<CardProps> = ({ asset, onDelete }) => {
  const canDelete = useCan('delete', 'media');
  return (
    <li className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card text-sm">
      <div className="aspect-square overflow-hidden bg-muted">
        <MediaThumbnail asset={asset} width={asset.width} height={asset.height} loading="lazy" />
      </div>
      <div className="flex min-w-0 flex-col gap-1 p-3">
        <p className="truncate font-medium" title={asset.fileName}>
          {asset.fileName}
        </p>
        <p className="text-xs text-muted-foreground">
          <span>{`${asset.width} × ${asset.height}`}</span>
          {' · '}
          <span>{formatBytes(asset.size)}</span>
        </p>
        <p className="text-xs text-muted-foreground">{DATE.format(new Date(asset.createdAt))}</p>
        <GatedButton
          decision={canDelete}
          variant="outline"
          size="sm"
          className="mt-2 self-start"
          aria-label={`Delete ${asset.fileName}`}
          onClick={() => onDelete(asset)}
        >
          Delete
        </GatedButton>
      </div>
    </li>
  );
};
MediaCard.displayName = 'MediaCard';

type Target = { asset: MediaAsset; session: number };

/**
 * `/admin/settings/media` (gated by `media:read`): the asset grid, newest first, with a search on
 * the file name (AC-35, AC-4). Upload sends the picked or dropped files one at a time and lists
 * their status (AC-36, AC-37); the batch summary is announced in the page's live region. Delete
 * confirms with the thumbnail (AC-38). Both actions are gated (AC-5).
 */
const MediaLibraryPage: React.FC = () => {
  const media = useMediaList();
  const uploads = useUploadMedia();
  const canUpload = useCan('upload', 'media');
  const { message, announce } = useAnnouncer();
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState('');
  const [target, setTarget] = useState<Target | null>(null);
  const [open, setOpen] = useState(false);

  const total = media.data?.length ?? 0;
  const visible = useMemo(
    () => filterBySearch(media.data ?? [], search, SEARCH_FIELDS),
    [media.data, search],
  );

  const upload = async (files: File[]) => {
    setSummary('');
    try {
      const result = await uploads.upload(files);
      if (!result) return;
      const text = uploadSummary(result);
      setSummary(text);
      announce(text);
    } catch (error) {
      // Only a guard denial rejects, and the gated control already prevents it.
      setSummary(error instanceof Error ? error.message : String(error));
    }
  };

  const openDelete = (asset: MediaAsset) => {
    setTarget((previous) => ({ asset, session: (previous?.session ?? 0) + 1 }));
    setOpen(true);
  };

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Media library</h1>
        <p className="text-sm text-muted-foreground">
          Upload and manage the PNG and JPEG images your content uses.
        </p>
      </header>
      <FileDropzone
        decision={canUpload}
        accept={UPLOAD_ACCEPT}
        hint="or drop PNG or JPEG images here"
        busy={uploads.isUploading}
        onFiles={(files) => void upload(files)}
        items={uploads.items}
        summary={summary}
      />
      <SearchField
        noun={NOUN}
        value={search}
        onChange={setSearch}
        count={visible.length}
        className="max-w-sm"
      />
      <ListState
        isPending={media.isPending}
        error={media.error}
        refetch={media.refetch}
        noun={NOUN}
        total={total}
        visible={visible.length}
        search={search}
      >
        <ul
          aria-label="Media files"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5"
        >
          {visible.map((asset) => (
            <MediaCard key={asset.documentId} asset={asset} onDelete={openDelete} />
          ))}
        </ul>
      </ListState>
      {target && (
        <DeleteMediaDialog
          key={target.session}
          asset={target.asset}
          open={open}
          onOpenChange={setOpen}
          onDeleted={announce}
        />
      )}
      <LiveRegion message={message} />
    </section>
  );
};
MediaLibraryPage.displayName = 'MediaLibraryPage';

export default MediaLibraryPage;
