import { useMemo, useRef, useState, type ReactNode } from 'react';

import type { FileStatusItem } from '../components/native/FileDropzone';
import { MediaProvider } from '../components/native/MediaProvider';
import type { MediaSource } from '../hooks/use-media-source';
import type { Decision } from '../lib/decision';
import { DEMO_ASSETS, demoImageSrc, describeDemoAsset, type DemoAsset } from './mediaLibrary';

const ALLOWED: Decision = { allowed: true, reason: null };

export interface DemoMediaProviderProps {
  children: ReactNode;
  /** The starting library; `undefined` keeps it loading. */
  items?: readonly DemoAsset[] | undefined;
  canBrowse?: Decision;
  canUpload?: Decision;
}

let nextUpload = 0;

/**
 * An in-memory media library for stories: the demo assets, and an upload that turns each PNG or
 * JPEG into a blob-URL asset after a short delay, listing its progress like a real batch.
 */
export const DemoMediaProvider: React.FC<DemoMediaProviderProps> = ({
  children,
  items: initial = DEMO_ASSETS,
  canBrowse = ALLOWED,
  canUpload = ALLOWED,
}) => {
  const [items, setItems] = useState(initial);
  const [uploads, setUploads] = useState<FileStatusItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const running = useRef(false);

  const source = useMemo<MediaSource<DemoAsset>>(
    () => ({
      items,
      describe: describeDemoAsset,
      canBrowse,
      canUpload,
      upload: async (files) => {
        if (running.current) return null;
        running.current = true;
        setUploading(true);
        const batch = files.map<FileStatusItem>((file) => ({
          key: `demo-upload-${(nextUpload += 1)}`,
          name: file.name,
          status: /\.(png|jpe?g)$/i.test(file.name) ? 'uploading' : 'failed',
          error: /\.(png|jpe?g)$/i.test(file.name) ? undefined : 'Unsupported file type.',
        }));
        setUploads(batch);
        await new Promise((resolve) => setTimeout(resolve, 300));
        const added = files
          .filter((_, index) => batch[index]?.status === 'uploading')
          .map<DemoAsset>((file) => ({
            documentId: `media-upload-${(nextUpload += 1)}`,
            fileName: file.name,
            width: 0,
            height: 0,
            size: file.size,
            url: URL.createObjectURL(file),
          }));
        setItems((previous) => [...added, ...(previous ?? [])]);
        setUploads(
          batch.map((item) => (item.status === 'failed' ? item : { ...item, status: 'uploaded' })),
        );
        running.current = false;
        setUploading(false);
        return {
          added,
          summary: `${added.length} of ${files.length} ${files.length === 1 ? 'file' : 'files'} uploaded.`,
        };
      },
      uploads,
      uploading,
      accept: 'image/png,image/jpeg',
      uploadHint: 'or drop PNG or JPEG images here',
      imageSrc: demoImageSrc,
    }),
    [items, canBrowse, canUpload, uploads, uploading],
  );

  return <MediaProvider value={source}>{children}</MediaProvider>;
};
DemoMediaProvider.displayName = 'DemoMediaProvider';
