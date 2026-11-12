import * as React from 'react';
import { createElement } from 'react';
import { cn } from 'cn';
import { File, FileText, Image, Video, type LucideIcon } from 'lucide-react';

import type { MediaInputFile } from './MediaInput';

type MediaPreviewHeight = 'field' | 'card';

interface MediaPreviewLabels {
  /** Alt text of the preview image when the file has none. */
  previewFallback: (fileName: string) => string;
  /** Text of the badge on a video preview. */
  videoBadge: string;
}

interface MediaPreviewProps {
  file: Pick<MediaInputFile, 'fileName' | 'mimeType' | 'url' | 'thumbnailUrl' | 'alt'>;
  /** `field` is the MediaInput size, `card` the smaller library card. */
  height: MediaPreviewHeight;
  labels: MediaPreviewLabels;
  /** Overlay buttons, top right. */
  actions?: React.ReactNode;
  className?: string | undefined;
}

const HEIGHT_CLASS: Record<MediaPreviewHeight, string> = {
  field: 'h-(--size-media-preview)',
  card: 'h-(--size-media-card-preview)',
};

const IMAGE_PREFIX = 'image/';
const VIDEO_PREFIX = 'video/';

/** One entry per MIME family; the first prefix that matches wins. */
const KIND_ICONS: ReadonlyArray<readonly [prefix: string, icon: LucideIcon]> = [
  [IMAGE_PREFIX, Image],
  [VIDEO_PREFIX, Video],
  ['application/pdf', FileText],
];

function iconForKind(mimeType: string | undefined): LucideIcon {
  const match = KIND_ICONS.find(([prefix]) => mimeType?.startsWith(prefix) === true);
  return match === undefined ? File : match[1];
}

/** Image: its own url when no thumbnail; video and others: the thumbnail only. */
function previewSource(file: MediaPreviewProps['file']): string | null {
  if (file.thumbnailUrl !== null) return file.thumbnailUrl;
  return file.mimeType?.startsWith(IMAGE_PREFIX) === true ? file.url : null;
}

/** The file's picture (or a kind icon) at a fixed height, with overlay actions. */
function MediaPreview({ file, height, labels, actions, className }: MediaPreviewProps) {
  const source = previewSource(file);
  const isVideo = file.mimeType?.startsWith(VIDEO_PREFIX) === true;

  return (
    <div
      data-slot="media-preview"
      className={cn(
        'border-border bg-muted relative flex w-full items-center justify-center overflow-hidden rounded-md border',
        HEIGHT_CLASS[height],
        className,
      )}
    >
      {source === null ? (
        createElement(iconForKind(file.mimeType), {
          'aria-hidden': true,
          className: 'text-muted-foreground size-12',
        })
      ) : (
        <img
          src={source}
          alt={file.alt ?? labels.previewFallback(file.fileName)}
          className="size-full object-contain"
        />
      )}
      {isVideo ? (
        <span
          data-slot="media-video-badge"
          className="bg-card text-card-foreground border-border absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs font-medium"
        >
          <Video aria-hidden="true" className="size-3" />
          {labels.videoBadge}
        </span>
      ) : null}
      {actions === undefined ? null : (
        <div
          data-slot="media-preview-actions"
          className="[&_button]:bg-card [&_button]:shadow-overlay absolute top-2 right-2 flex gap-1 [&_button]:rounded-full"
        >
          {actions}
        </div>
      )}
    </div>
  );
}

export { MediaPreview, type MediaPreviewHeight, type MediaPreviewLabels, type MediaPreviewProps };
